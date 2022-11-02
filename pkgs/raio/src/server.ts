import path from "path"
import glob from "glob"
import { createRouter } from "radix3"
import { z } from "zod"
import pino from "pino"
import { inspect } from "util"

import type { CallData, Router } from "."

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const presetSchema = z.object({
  adaptor: z.function().optional(),
  config: z.function().optional(),
  context: z.function().optional(),
  requestContext: z.function().optional(),
  handler: z.function().optional(),
  error: z.function().optional()
})

type ServerConfig = {
  cwd: string
  routeDirs: string
  preset?: string[]
  presetApp?: z.infer<typeof presetSchema> // mostly for testing purpose
}

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
    moduleLogger.error({ error }, 'Unexpected module format')
    throw error
  } else if (!required && moduleFiles.length === 0) {
    moduleLogger.debug('skip on non required module')
    return
  }

  if (moduleFiles.length > 1) {
    const error = new Error(`Expected to have only one file of type ${moduleName}`)
    moduleLogger.error({ error }, 'Duplicated module')
    throw error
  }

  moduleLogger.debug({ moduleFile: moduleFiles[0] }, 'loading')
  const loadingModuleFile = moduleFiles[0]

  const loadingPath: string = loadingModuleFile.startsWith('.')
    ? `${cwd}/${loadingModuleFile}`
    : loadingModuleFile

  const mod = await import(loadingPath)
  moduleLogger.debug({ mod, s: inspect(mod) }, 'loaded >>>>>>>')

  moduleLogger.debug('testing againts zod')

  const validatedMod = type === 'preset'
    ? presetSchema.parse(mod)
    : schemas[type].parse(mod)

  moduleLogger.info({ test: validatedMod['adaptor'] }, 'loaded successfully')
  return mod
}

const definedProps = (obj: any) => Object.fromEntries(
  Object.entries(obj).filter(([k, v]) => v !== undefined)
);

async function dynamicLoad(serverConfig: ServerConfig) {
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
      config: configMod?.config,
      adaptor: adaptorMod?.adaptor,
      context: contextMod?.context,
      requestContext: contextMod?.requestContext,
      handler: handlerMod?.handler
    }
  }

  const presetApp = preset ? await loadPreset() : {}
  const components = await loadComponent()
  
  const nonValidatedApp = {...definedProps(presetApp), ...definedProps(components)}

  return nonValidatedApp
}

async function startServer(serverConfig: ServerConfig = {
  cwd: process.cwd(),
  routeDirs: './routes',
  preset: []
}) {
  const { cwd, routeDirs } = serverConfig

  const nonValidatedApp = serverConfig.presetApp 
    ? serverConfig.presetApp
    : await dynamicLoad(serverConfig)
 
  const app = presetSchema.parse({
    adaptor: nonValidatedApp.adaptor,
    config: nonValidatedApp.config,
    context: nonValidatedApp.context,
    requestContext: nonValidatedApp.requestContext,
    handler: nonValidatedApp.handler,
    error: nonValidatedApp.error,
  })

  const resolvedConfig = await app.config?.() || {}
  logger.debug({ resolvedConfig })

  const resolvedContext = await app.context?.(resolvedConfig) || {}
  const context = Object.assign({}, resolvedContext, { config: resolvedConfig })

  const router = createRouter()

  const maybeRouteDir = path.join(cwd, routeDirs)

  const maybeRoutes = glob.sync('*.[j|t]s', { cwd: maybeRouteDir })

  logger.debug({ routes: maybeRoutes }, 'found files')

  const routes: string[] = [] // because router doesn't provide way to get all routes

  for (const maybeRoute of maybeRoutes) {
    const routeLogger = logger.child({ route: maybeRoute, cwd, routeDirs })
    const mod = await import(path.resolve(maybeRouteDir, maybeRoute))

    const resolvedFns = await app.handler(resolvedConfig, mod) as Array<any>

    const caller = async (data: CallData['input']) => {
      const callData: CallData = {
        config: resolvedConfig,
        context: { ...context }, // otherwise it'll modify the shared context
        input: data,
        output: { headers: {}, body: undefined }
      }

      const requestContext = await app.requestContext?.(callData, resolvedConfig, context) as {} || {}
      
      callData.context = { ...callData.context, ...definedProps(requestContext) }

      const callLogger = routeLogger.child({ data })

      for await (const resolvedFn of resolvedFns) {
        callLogger.debug('before calling')
        await resolvedFn(callData)
        callLogger.debug('after calling')
      }

      return callData
    }

    const routePath = path.basename(maybeRoute, path.extname(maybeRoute))
    routes.push(routePath)

    logger.info({ route: routePath }, 'registering route to router')
    router.insert(routePath, { caller })
  }

  const adaptorRouter: Router = {
    call: async (route, input) => {
      const { caller } = router.lookup(route) as any
      return caller(input)
    },
    has: (route: string) => {
      return !!router.lookup(route)
    }
  }

  logger.info("Triggering adaptors")
  await app.adaptor(resolvedConfig, context, adaptorRouter)
}

export { startServer }