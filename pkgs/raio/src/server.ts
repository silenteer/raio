import { register } from 'esbuild-register/dist/node'
register({})

import opentelemetry, { SpanKind, SpanStatusCode } from "@opentelemetry/api"
import dotenv from "dotenv"
import envDotProp from "env-dot-prop"
import glob from "glob"
import errors from 'http-errors'
import { customAlphabet } from "nanoid"
import path from "path"
import { createRouter } from "radix3"
import { inspect } from "util"
import { z } from "zod"
import { CallContext, ConfigFn, ContextFn, define, Handler, logger, Raio, Router } from "."
import { createChildSpan, instrument } from "./instrument"
import { init } from "./tracing"
import { merge } from "./utils"

const tracer = opentelemetry.trace.getTracer('main')

const presetSchema = z.object({
  adaptor: z.function().optional(),
  config: z.function().optional(),
  context: z.function().optional(),
  requestContext: z.function().optional(),
  handler: z.function().optional(),
  error: z.function().optional(),
  healtcheck: z.function().optional()
})

export const defaultHandler = define.handler(async (server, mod, modMeta) => {
  const handlerLogger = logger.child({ name: 'defaultHandler' })
  handlerLogger.debug('setting up handler')

  const handle = mod.default
    ? mod.default
    : defaultHandleSchema.parse(mod).handle

  return {
    handle,
    metadata: modMeta
  } // use to remap name
})

export const defaultErrorHandler = define.error(async (e, callContext) => {
  if (errors.isHttpError(e) && e.statusCode !== 500) {
    return {
      headers: {},
      code: e.statusCode,
      body: e
    }
  } else {
    return { headers: {}, code: e?.statusCode || 500, body: e }
  }
})

const appSchema =  z.object({
  adaptor: z.function().array().default([]),
  config: z.function().array().default([]),
  context: z.function().array().default([]),
  requestContext: z.function().array().default([]),
  handler: z.function().default(defaultHandler),
  error: z.function().array().default([defaultErrorHandler]),
  healthcheck: z.function().array().default([])
})

const serverConfigSchema = z.object({
  name: z.string().default(path.basename(process.cwd())),
  cwd: z.string().default(process.cwd()),
  routeDirs: z.string().array().default(['./routes']),
  preset: z.string().array().optional().default([]),
  execute: z.string().optional(),
  body: z.any().optional(),
  headers: z.record(z.string()).default({}),
  configPrefix: z.string().default('raio'),
  env: z.string().default('.env')
})

type ServerConfig = z.infer<typeof serverConfigSchema>

/** check if file is there, load if needed throw Error if module not found */
async function loadModule(
  cwd: string,
  moduleName: string,
  required: boolean = false): Promise<any> {
  const moduleLogger = logger.child({ cwd, moduleName, required })
  moduleLogger.debug('loading')

  let moduleFiles: string[] = []
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

  const validatedMod = presetSchema.parse(mod.default || mod)

  // Decorate function with the file where it is loaded and its
  Object.keys(validatedMod)
    .filter(key => typeof validatedMod[key] === 'function')
    .forEach(key => validatedMod[key].meta = { file: loadingModuleFile, name: key })

  moduleLogger.debug({ mod: inspect(validatedMod) }, 'module loaded')
  return validatedMod
}

async function dynamicLoad(serverConfig: ServerConfig) {
  const { cwd, routeDirs, preset } = serverConfig
  const dynamicLoadLogger = logger.child({ name: 'dynamicLoad' })
  dynamicLoadLogger.debug({ cwd, routeDirs, preset }, 'raio config')
  
  let mod: z.infer<typeof appSchema> = {
    adaptor: [],
    config: [],
    context: [],
    error: [defaultErrorHandler],
    healthcheck: [],
    handler: defaultHandler,
    requestContext: []
  }

  const presetLogger = dynamicLoadLogger.child({ presets: serverConfig.preset })

  for (const loadingPreset of serverConfig.preset) {
    presetLogger.debug({ cwd, loadingPreset }, 'loading preset', true)
    const loadedPreset = await loadModule(cwd, loadingPreset)
    mod = merge(mod, loadedPreset)
  }

  presetLogger.debug({ current: inspect(mod) }, 'preset module')

  return appSchema.parse(mod)
}

const nanoid = customAlphabet('abcdefghijklmnopqrstuvxyz', 6)

const defaultHandleSchema = z.object({
  handle: z.function()
})

async function startServer(serverConfig: ServerConfig) {
  const dotProp = await import("dot-prop")
  const mainSpan = tracer.startSpan('main')

  try {
    const { cwd, routeDirs, execute, body, headers, name, configPrefix, env } = serverConfigSchema.parse(serverConfig)

    const envConfig = dotenv.config({
        path: path.join(cwd, env)
      })
      .parsed || {}

    Object.keys(envConfig).forEach(key => {
      const value = envConfig[key]
      delete envConfig[key]
      const envKey = configPrefix.trim() === ''
        ? key
        : `${configPrefix}.${key}`
      envDotProp.set(envKey, value)
    })

    const envConf = envDotProp.get(configPrefix) || {}
    const config = merge(envConfig, envConf)
    
    const serverLogger = logger.child({ name: 'server' })
    const app = await dynamicLoad(serverConfig)
    
    init({ appName: name, appVersion: 'dev' })

    let raio: Raio = {
      config,
      context: {},
      routes: [],
      getConfig(path: string) {
        return dotProp.getProperty(this.config, path)
      },
      async loadConfig(configFn?: ConfigFn<any>) {
        serverLogger.debug("start loading config")
        const resolvedConfig = await configFn?.(this) || await Promise.resolve({})
        this.config = merge(this.config, resolvedConfig)

        serverLogger.debug({ resolvedConfig, config: this.config, fn: inspect(configFn) }, 'config loaded')
      },
      async loadContext(contextFn?: ContextFn<any>) {
        serverLogger.debug("start loading context")
        const resolvedContext = await contextFn?.(this) || {}
        this.context = merge(this.context, resolvedContext)
        serverLogger.debug({ resolvedContext, raio: this, fn: inspect(contextFn) }, 'context loaded')
      },
      async healthcheck() {
        const result = await Promise.allSettled(app.healthcheck.map(fn => fn(this)))

        const kos = result.filter(r  => r.status === 'rejected')

        if (kos.length === 0) { return { status: 'OK' } }

        return {
          status: 'KO',
          errors: (kos as PromiseRejectedResult[]).map(ko => ko.reason)
        }
      },
      async inspect() {
        return {
          context: this.context,
          config: this.config,
          routes: this.routes
        }
      }
    }

    instrument(raio, { parentSpan: mainSpan, exclude: ['requestContext', 'error'] })
    instrument(app, { parentSpan: mainSpan })

    const configSpan = createChildSpan('config', mainSpan)
    instrument(app.config, { parentSpan: configSpan })

    await app.config.reduce(async (_, nextFn) => {
      await raio.loadConfig(nextFn)
    }, Promise.resolve())

    configSpan.end()

    const contextSpan = createChildSpan('context', mainSpan)
    instrument(app.context, { parentSpan: contextSpan })
    
    await app.context.reduce(async (_, nextFn) => {
      await raio.loadContext(nextFn)
    }, Promise.resolve())

    contextSpan.end()

    const router = createRouter()

    const maybeRoutes = routeDirs.reduce((routes, nextPath) => {
      const foundFiles = glob.sync(`${nextPath}/*.[j|t]s`, { cwd })
      return [...routes, ...foundFiles]
    }, [])

    serverLogger.debug({ routes: maybeRoutes }, 'found files')

    const routes: string[] = [] // because router doesn't provide way to get all routes

    for (const maybeRoute of maybeRoutes) {
      const routeLogger = serverLogger.child({ route: maybeRoute, cwd, routeDirs })
      const modulePath = path.resolve(cwd, maybeRoute)
      routeLogger.debug({ modulePath }, 'start loading route')

      const mod = require(modulePath)
      const modMetadata = { path: maybeRoute, name: path.basename(maybeRoute, path.extname(maybeRoute)) }
      routeLogger.debug({ modMetadata })

      routeLogger.debug("start resolve handle")
      const handler = await app.handler(raio, mod, modMetadata) as Handler
      routeLogger.debug({ handler }, "route config resolved")

      const caller = async (data?: CallContext['input'], callConfig?: Record<string, any>) => {
        const routee = { ...handler }
        const appForRoute = { requestContext: [...app.requestContext], error: [...app.error] }

        const routeSpan = callConfig?.span || tracer.startSpan('route', {
          kind: SpanKind.SERVER,
          attributes: {
            route: handler.metadata.name
          }
        })

        instrument(routee, { parentSpan: routeSpan })
        instrument(appForRoute.requestContext, { parentSpan: routeSpan })
        instrument(appForRoute.error, { parentSpan: routeSpan })

        let callContext: CallContext = {
          id: callConfig?.['id'] || nanoid(),
          server: raio,
          config: raio.config,
          context: merge(raio.context, callConfig),
          input: data || { headers: {}, body: undefined },
          output: { headers: {}, body: undefined, code: 200 }, //mimic http status 
          instrument(target, ...args) {
            instrument(target, { parentSpan: routeSpan, ...args })
          },
          logger: undefined as any // too lazy to argue with typescript
        }

        const callLogger = routeLogger.child({ name: callContext.id })
        callContext.logger = callLogger

        callLogger.debug({ input: data, callContext }, 'incoming')

        try {
          routeSpan.setAttribute('id', callContext.id)

          callLogger.debug('incoming request')

          const requestContextSpan = createChildSpan('requestContext', routeSpan)
          instrument(appForRoute.requestContext, { parentSpan: requestContextSpan })
          
          for (const requestContextFn of appForRoute.requestContext) {
            const requestContextObject = await requestContextFn(callContext)
            callContext.context = merge(callContext.context, requestContextObject)
          }
          requestContextSpan.end()

          callLogger.debug({input: callContext.input}, 'before calling')

          const resolvedCallContext = await routee.handle(callContext)
          routeSpan.addEvent('handler called')

          callContext = merge(callContext, resolvedCallContext)
          callLogger.debug('after calling')

          routeSpan.end()
        } catch (e) {
          callLogger.debug({ err: e}, 'handling')
          for (const errorFn of appForRoute.error) {
            callLogger.debug('executing error fn')
            const errorOutput = await errorFn(e, callContext)
            callLogger.debug({ output: errorOutput }, 'error output value')
            callContext.output = merge(callContext.output, errorOutput)
          }

          if (callContext.output.code !== 200) {
            routeSpan.recordException(e)
            routeSpan.setStatus({
              code: SpanStatusCode.ERROR
            })
            .end()
          }
        }

        return callContext
      }

      routes.push(handler.metadata.name)

      serverLogger.info({ route: handler.metadata.name }, 'registering route to router')
      router.insert(handler.metadata.name, { caller })
    }

    const adaptorRouter: Router = {
      call: async (route, input, callConfig) => {
        const { caller } = router.lookup(route) as any
        return caller(input, callConfig)
      },
      has: (route: string) => {
        return !!router.lookup(route)
      },
      healthcheck: () => raio.healthcheck(),
      _router: router
    }

    mainSpan.end()

    if (execute) {
      if (adaptorRouter.has(execute)) {
        logger.debug('start execution [%s] - %s', execute, body)
        
        const result = await adaptorRouter.call(
          execute,
          { headers, body}
        )
        logger.debug({ output: result.output }, 'executed')
        console.log(JSON.stringify(result.output))
        process.exit(0)
      } else {
        console.log(JSON.stringify({ output: { code: 404 }}))
        logger.error('cannot find route %s', execute)
        process.exit(1)
      }
    } else if (app.adaptor.length > 0) {
      serverLogger.info("Triggering adaptors")
      app.adaptor.forEach(adaptorFn => adaptorFn(raio, adaptorRouter))
    } else {
      serverLogger.info("There's nothign to process further, exiting")
      process.exit(0)
    }

  } catch (e) {
    mainSpan.recordException(e)
    mainSpan.setStatus({
      code: SpanStatusCode.ERROR
    }).end()
    throw e
  }
}

export { startServer }
