import path from "path"
import glob from "glob"
import { createRouter, toRouteMatcher } from "radix3"
import { z } from "zod"
import { inspect } from "util"
import merge from "lodash.merge"
import { customAlphabet } from "nanoid"

import { CallContext, Router, AdaptorFn, ConfigFn, Raio, ContextFn, RequestContextFn, HandlerFn, define } from "."
import { logger } from "."
import { HandleFn } from "../dist"

const presetSchema = z.object({
  adaptor: z.function().optional(),
  config: z.function().optional(),
  context: z.function().optional(),
  requestContext: z.function().optional(),
  handler: z.function().optional(),
  error: z.function().optional()
})

const serverConfigSchema = z.object({
  cwd: z.string().default(process.cwd()),
  routeDirs: z.string().array().default(['./routes']),
  preset: z.string().array().optional().default([]),
  presetApp: presetSchema.optional(),
  execute: z.string().optional(),
  executeArgs: z.preprocess(value => value && JSON.parse(value as string), z.object({
    headers: z.record(z.string()).default({}),
    body: z.any().optional()
  }))
  .optional()
})

type ServerConfig = z.infer<typeof serverConfigSchema>

const schemas = {
  adaptor: z.object({ adaptor: z.function() }),
  config: z.object({ config: z.function() }),
  context: z.object({
    context: z.function().optional(),
    requestContext: z.function().optional()
  })
    .refine(
      ({ context, requestContext }) => context || requestContext,
      "At least context or requestContext must be provided"
    ),
  handler: z.object({ handler: z.function() }),
  error: z.object({ error: z.function() })
}

/** check if file is there, load if needed throw Error if module not found */
async function loadModule(
  cwd: string,
  moduleName: string,
  type: keyof typeof schemas | 'preset',
  required: boolean = false): Promise<any> {
  const moduleLogger = logger.child({ cwd, moduleName, required, type })
  moduleLogger.debug('loading')

  let moduleFiles = []
  if (!moduleName.startsWith('.')) { // absolute, just load as it is
    moduleLogger.debug('adding relative module')
    moduleFiles.push(moduleName)
  } else if (['.js', '.ts'].includes(path.extname(moduleName))) {
    moduleLogger.debug('adding relavtive file due to ext')
    moduleFiles.push(moduleName)
  } else {
    moduleLogger.debug('overwrite files with result of glob')
    moduleFiles = glob.sync(`${moduleName}.[j|t]s`, { cwd })
  }

  moduleLogger.debug({ moduleFiles }, 'found')

  if (required && moduleFiles.length === 0) {
    const error = new Error(`Expected to have ${moduleName} at ${cwd}`)
    moduleLogger.error(error, 'Unexpected module format')
    throw error
  } else if (!required && moduleFiles.length === 0) {
    moduleLogger.debug('skip on non required module')
    return
  }

  if (moduleFiles.length > 1) {
    const error = new Error(`Expected to have only one file of type ${moduleName}`)
    moduleLogger.error(error, 'Duplicated module')
    throw error
  }

  moduleLogger.debug({ moduleFile: moduleFiles[0] }, 'loading')
  const loadingModuleFile = moduleFiles[0]

  const loadingPath: string = loadingModuleFile.startsWith('.')
    ? `${cwd}/${loadingModuleFile}`
    : loadingModuleFile

  const mod = require(loadingPath)
  moduleLogger.debug('testing againts zod')

  const validatedMod = type === 'preset'
    ? presetSchema.parse(mod)
    : schemas[type].parse(mod)

  return validatedMod
}

async function dynamicLoad(serverConfig: ServerConfig) {
  logger.warn('component load is being deprecated, use preset instead')
  const { cwd, routeDirs, preset } = serverConfig
  const dynamicLoadLogger = logger.child({ name: 'dynamicLoad' })
  dynamicLoadLogger.debug({ cwd, routeDirs, preset }, 'raio config')

  async function loadPreset(): Promise<z.infer<typeof presetSchema>> {
    const presetLogger = dynamicLoadLogger.child({ presets: serverConfig.preset })
    let mod = {}
    for (const loadingPreset of serverConfig.preset) {
      presetLogger.debug({ cwd, loadingPreset }, 'loading preset', true)
      const loadedPreset = await loadModule(cwd, loadingPreset, 'preset')
      mod = { ...mod, ...loadedPreset }
    }
    presetLogger.debug({ current: inspect(mod) }, 'preset module')
    return mod
  }

  async function loadComponent(): Promise<z.infer<typeof presetSchema>> {
    const configMod = await loadModule(cwd, './config', 'config')
    const contextMod = await loadModule(cwd, './context', 'context')
    const handlerMod = await loadModule(cwd, './handler', 'handler')
    const adaptorMod = await loadModule(cwd, './adaptor', 'adaptor')

    return {
      config: configMod?.config as ConfigFn<any> | undefined,
      adaptor: adaptorMod?.adaptor as AdaptorFn | undefined,
      context: contextMod?.context as ContextFn<any> | undefined,
      requestContext: contextMod?.requestContext as RequestContextFn<any> | undefined,
      handler: handlerMod?.handler as HandlerFn | undefined
    }
  }
  
  const presetApp = preset ? await loadPreset() : {}
  const components = await loadComponent()

  const nonValidatedApp = merge(presetApp, components)

  return nonValidatedApp
}

const nanoid = customAlphabet('abcdefghijklmnopqrstuvxyz', 6)

const defaultHandleSchema = z.object({
  handle: z.function()
})

const defaultHandler = define.handler(async (server, mod, modMeta) => {
  const handlerLogger = logger.child({ name: 'defaultHandler' })
  handlerLogger.debug('setting up handler')
  
  const handle = mod.default
    ? mod.default
    : defaultHandleSchema.parse(mod).handle

  return handle // should be validated to have handle already
})

async function startServer(serverConfig: ServerConfig) {
  const { cwd, routeDirs, execute, executeArgs } = serverConfigSchema.parse(serverConfig)

  let raio: Raio = {
    config: {},
    context: {},
    routes: []
  }

  const serverLogger = logger.child({ name: 'server' })

  const nonValidatedApp = serverConfig.presetApp
    ? serverConfig.presetApp
    : await dynamicLoad(serverConfig)

  const app = presetSchema.parse({
    adaptor: nonValidatedApp.adaptor,
    config: nonValidatedApp.config,
    context: nonValidatedApp.context,
    requestContext: nonValidatedApp.requestContext,
    handler: nonValidatedApp.handler || defaultHandler,
    error: nonValidatedApp.error,
  })

  const resolvedConfig = await app.config?.(raio) || {}

  raio = merge(raio, { config: resolvedConfig })
  serverLogger.debug({ resolvedConfig, raio }, 'config loaded')

  const resolvedContext = await app.context?.(raio) || {}
  raio = merge(raio, { context: resolvedContext })

  serverLogger.debug({ resolvedContext, raio }, 'context loaded')

  const router = createRouter()

  const maybeRoutes = routeDirs.reduce((routes, nextPath) => {
    const searchPath = path.join(cwd, nextPath)
    const foundFiles = glob.sync('*.[j|t]s', { cwd: searchPath })
    return [...routes, ...foundFiles.map(f => path.join(searchPath, f))]
  }, [])

  serverLogger.debug({ routes: maybeRoutes }, 'found files')

  const routes: string[] = [] // because router doesn't provide way to get all routes

  for (const maybeRoute of maybeRoutes) {
    const routeLogger = serverLogger.child({ route: maybeRoute, cwd, routeDirs })
    const modulePath = path.resolve(cwd, maybeRoute)
    routeLogger.debug({ modulePath }, 'importing')

    const mod = await import(modulePath)

    const modMetadata = { path: maybeRoute, name: path.basename(maybeRoute, path.extname(maybeRoute)) }
    routeLogger.debug({ modMetadata })

    const handleFn = await app.handler(raio, mod, modMetadata) as HandleFn

    const caller = async (data: CallContext['input'], callConfig: Record<string, any>) => {
      let callContext: CallContext = {
        id: callConfig?.['id'] || nanoid(),
        server: raio,
        config: raio.config,
        context: merge(raio.context, callConfig),
        input: data,
        output: { headers: {}, body: undefined }
      }

      const callLogger = routeLogger.child({ name: callContext.id })
      callLogger.debug('incoming request')

      const requestContext = await app.requestContext?.(callContext) as {} || {}
      callContext = merge(callContext, { context: requestContext })
      callLogger.debug({ requestContext }, 'resolved request context')

      callLogger.debug('before calling')
      const resolvedCallContext = await handleFn(callContext)
      callContext = merge(callContext, resolvedCallContext)
      callLogger.debug('after calling')

      return callContext
    }

    const routePath = path.basename(maybeRoute, path.extname(maybeRoute))
    routes.push(routePath)

    serverLogger.info({ route: routePath }, 'registering route to router')
    router.insert(routePath, { caller })
  }

  const adaptorRouter: Router = {
    call: async (route, input, callConfig) => {
      const { caller } = router.lookup(route) as any
      return caller(input, callConfig)
    },
    has: (route: string) => {
      return !!router.lookup(route)
    },
    _router: router
  }

  serverLogger.debug({ routes: router.ctx.staticRoutesMap }, "route table")

  if (execute) {
    if (adaptorRouter.has(execute)) {
      const result = await adaptorRouter.call(
        serverConfig.execute, 
        executeArgs as any || { headers: {}, body: undefined }
      )
      logger.debug({ output: result.output }, 'executed')
      console.log(JSON.stringify(result.output))
      process.exit(0)
    } else {
      logger.error('cannot find route %s', serverConfig.execute)
      process.exit(1)
    }
  } else if(app.adaptor) {
    serverLogger.info("Triggering adaptors")
    await app.adaptor(raio, adaptorRouter)
  } else {
    serverLogger.info("There's nothign to process further, exiting")
    process.exit(0)
  }

}

export { startServer }