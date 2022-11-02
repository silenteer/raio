import path from "path"
import glob from "glob"
import { createRouter } from "radix3"
import { z } from "zod"
import pino from "pino"
import { inspect } from "util"

import type { CallData } from "."

type ServerConfig = {
  cwd: string
  routeDirs: string
  preset?: string[]
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const presetSchema = z.object({
  adaptor: z.function().optional(),
  config: z.function().optional(),
  context: z.function().optional(),
  requestContext: z.function().optional(),
  handler: z.function().optional(),
  error: z.function().optional()
})

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

async function createServer(serverConfig: ServerConfig = {
  cwd: process.cwd(),
  routeDirs: './routes',
  preset: []
}) {
  const { cwd, routeDirs, preset } = serverConfig
  logger.debug({ cwd, routeDirs, preset }, 'raio config')
  
  async function loadPreset(): Promise<z.infer<typeof presetSchema>> {
    const presetLogger = logger.child({ presets: serverConfig.preset })
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
  
  const app = presetSchema.parse({
    adaptor: nonValidatedApp.adaptor,
    config: nonValidatedApp.config,
    context: nonValidatedApp.context,
    requestContext: nonValidatedApp.requestContext,
    handler: nonValidatedApp.handler,
    error: nonValidatedApp.error,
  })

  logger.debug({ 
    app: inspect(app),
    nonValidatedApp: inspect(nonValidatedApp), 
    presetApp: inspect(definedProps(presetApp)), 
    components: inspect(definedProps(components)) 
  }, 'merged app')

  const resolvedConfig = await app.config?.() || {}
  logger.debug({ resolvedConfig })

  const resolvedContext = await app.context?.(resolvedConfig) || {}

  const router = createRouter()

  const maybeRouteDir = path.join(cwd, routeDirs)

  const maybeRoutes = glob.sync('*.[j|t]s', { cwd: maybeRouteDir })

  logger.debug({ routes: maybeRoutes }, 'found files')

  for (const maybeRoute of maybeRoutes) {
    const routeLogger = logger.child({ route: maybeRoute, cwd, routeDirs })
    const mod = await import(path.resolve(maybeRouteDir, maybeRoute))

    const resolvedFns = await app.handler(resolvedConfig, mod) as Array<any>

    const caller = async (data: CallData) => {
      const requestContext = await app.requestContext?.(data, resolvedConfig, resolvedContext) as {} || {}
      const callingData = Object.assign(data, { ...requestContext, config: resolvedConfig})
      const callLogger = routeLogger.child({ data })

      for await (const resolvedFn of resolvedFns) {
        callLogger.debug('before calling')
        await resolvedFn(callingData)
        callLogger.debug('after calling')
      }

      return callingData
    }

    const routePath = path.basename(maybeRoute, path.extname(maybeRoute))

    logger.info({ route: routePath }, 'registering route to router')
    router.insert(routePath, { caller })
  }

  async function call(route: string, data: CallData) {
    const { caller } = router.lookup(route) as any
    return caller(data)
  }

  function has(route: string) {
    return router.lookup(route)
  }

  logger.info("Triggering adaptors")
  await app.adaptor(resolvedConfig, resolvedContext, { call, has })
}

export { createServer }