import { NatsAuthorizationInjection, NatsAuthorize, NatsHandler, NatsInjection, NatsValidate, NatsValidationInjection, NatsHandle, NatsHandleInjection } from "@silenteer/natsu"
import { NatsService } from "@silenteer/natsu-type"
import { connect, JSONCodec, MsgHdrsImpl, NatsConnection } from "nats"
import { MsgImpl } from "nats/lib/nats-base-client/msg"
import { decode, encode } from "nats/lib/nats-base-client/encoders"
import { logger, define, inferDefine, errors } from "../../"
import { z } from "zod"

const natsuLogger = logger.child({ name: 'natsu' })

type AnyService = NatsService<string, any, any>

type LogService = ContextShape['logService']
type NatsUtils = ContextShape['natsService']

const logService: LogService = {
  log: console.log,
  error: console.log,
  info: console.log,
  warn: console.log
}

const natsuConfigSchema = z.object({
  urls: z.string({ description: 'url to connect to nats, set via natsu.urls, expect string[]' }).array().optional(),
  user: z.string({ description: 'user to connect to nats, set via natsu.user'}).optional(),
  pass: z.string({ description: 'pass to connect to nats, set via natsu.pass'}).optional()
})

export type NatsuConfig = z.infer<typeof natsuConfigSchema>

export const context = define.context(async (server) => {
  const natsuConfig = natsuConfigSchema.parse({
    urls: server.getConfig('natsu.urls'),
    user: server.getConfig('natsu.user'),
    pass: server.getConfig('natsu.pass')
  })

  const nc = await connect({ servers: natsuConfig.urls, user: natsuConfig.user, pass: natsuConfig.pass })
  const { encode, decode } = JSONCodec()
  const ns: NatsUtils = {
    async request(subject, data, opts) {
      return nc.request(subject, data && encode(data), opts)
    },
    async publish(subject, data, opts) {
      return nc.publish(subject, data && encode(data), opts)
    },
    async drain() {
      return nc.drain()
    },
    subscribe(subject, opts) {
      return nc.subscribe(subject, opts)
    }
  }
  
  return {
    nc, natsService: ns, encode, decode, logService
  } as const
})

const natsServiceSchema = z.object({})
const logServiceSchema = z.object({
  log: z.function(),
  info: z.function(),
  error: z.function(),
  warn: z.function()
})

type y = NatsHandler<AnyService>
type x = NatsAuthorize<AnyService>

type ContextShape = NatsInjection<AnyService>
const natsuInjectionSchema = z.object({
  subject: z.string(),
  message: z.instanceof(MsgImpl),
  logService: logServiceSchema,
  natsService: natsServiceSchema,
  handler: z.object({})
})

const natsuRequestSchema = z.object({
  headers: z.record(z.string()).optional(),
  body: z.any()
})

const natsuResponseSchema = natsuRequestSchema
  .extend({ code: z.literal('OK').or(z.number())})

const natsuFnSchema = z.function()
  .args(natsuRequestSchema, natsuInjectionSchema)
  .returns(z.promise(natsuResponseSchema))

const handlerSchema = z.object({
  subject: z.string(), // name can comes from the file as well
  validate: natsuFnSchema.optional(),
  authorize: natsuFnSchema.optional(),
  handle: natsuFnSchema
})

type NatsuHandler = z.infer<typeof handlerSchema>

export type NatsuContext = inferDefine<typeof context>

export const requestContext = define.requestContext(
  async (callContext) => {
    const msg = callContext.context.msg
    
    if (!(msg instanceof MsgImpl)) {
      throw errors.BadRequest('Invalid nats message')
    }

    const natsuContext = {
      subject: msg.subject,
      message: msg
    }

    return natsuContext
  })

export type NatsuRequestContext = inferDefine<typeof requestContext>

export const natsuValidate = (mod: NatsuHandler) => define.handle(async data => {
  if (!mod.validate) return

  const fn = mod.validate as unknown as NatsValidate<AnyService>

  const natsuContext: NatsValidationInjection<AnyService> = {
    subject: mod.subject,
    message: data.context.msg as any,
    natsService: data.context.natsService,
    logService: data.context.logService,
    handler: mod as any,
    ok() { return { code: 'OK' } },
    error(params) {
      if (params?.errors instanceof Error) {
        throw errors(params?.code || 400, params?.errors) 
      } if (typeof params?.errors === 'string') {
        throw errors.BadRequest(params.errors)
      } else {
        throw errors.BadRequest()
      }
    }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result as any)
})

export const natsuAuthorize = (mod: NatsuHandler) => define.handle(async data => {
  if (!mod.authorize) return

  const fn = mod.authorize as unknown as NatsAuthorize<AnyService>

  const natsuContext: NatsAuthorizationInjection<AnyService> = {
    subject: mod.subject,
    message: data.context.msg as any,
    natsService: data.context.natsService,
    logService: data.context.logService,
    handler: mod as any,
    ok() { return { code: 'OK' } },
    error(params) {
      if (params?.errors instanceof Error) {
        throw errors(params?.code || 403, params?.errors) 
      } if (typeof params?.errors === 'string') {
        throw errors.Unauthorized(params.errors)
      } else {
        throw errors.Unauthorized()
      }
    }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result as any)
})

export const natsuHandle = (mod: NatsuHandler) => define.handle(async data => {
  const fn = mod.handle as unknown as NatsHandle<AnyService>

  const natsuContext: NatsHandleInjection<AnyService> = {
    subject: mod.subject,
    message: data.context.msg as any,
    natsService: data.context.natsService,
    logService: data.context.logService,
    handler: mod as any,
    ok() { return { code: 'OK' } },
    error(params) {
      if (params?.errors instanceof Error) {
        throw errors(params?.code || 500, params?.errors) 
      } if (typeof params?.errors === 'string') {
        throw errors.InternalServerError(params.errors)
      } else {
        throw errors.InternalServerError()
      }
    }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result as any)
  else {
    return {
      output: {
        headers: result.headers as any,
        body: result.body
      }
    }
  }
})

export const handler = define.handler(async (server, mod, meta) => {
  
  const natsuComponent = mod?.default
  ? handlerSchema.parse(mod.default)
  : handlerSchema.parse(mod)
  
  return {
    handle: async (callContext) => {
      const routeComponent = { ...natsuComponent}
      callContext.instrument(routeComponent)

      const routeLogger = natsuLogger.child({ name: `route-${meta.name}-${callContext.id}` })
      // error will be thrown
      routeLogger.debug('incoming')
      const result = await Promise.resolve()
        .then(_ => natsuValidate(routeComponent)(callContext))
        .then(_ => natsuAuthorize(routeComponent)(callContext))
        .then(_ => natsuHandle(routeComponent)(callContext))
        .catch(error => {
          routeLogger.error(error, 'route caught an error')
          throw error
        })
  
      return result
    },
    metadata: {
      name: natsuComponent.subject
    }
  }
})

const contextSchema = z.object({
  nc: z.any()
})

import opentelementry, { SpanStatusCode } from "@opentelemetry/api"

const tracer = opentelementry.trace.getTracer('natsu')

export const healthcheck = define.healthcheck(async (server) => {
  const nc = contextSchema.passthrough().parse(server.context).nc as NatsConnection
  
  if (nc.isClosed()) {
    throw errors.InternalServerError('nats is disconnected')
  }
})

export const adaptor = define.adaptor(async (server, router) => {
  const nc = contextSchema.passthrough().parse(server.context).nc as NatsConnection

  nc.subscribe('>', {
    callback(err, msg) {
      if (err) { console.log(err) }
      else if (msg) {
        const span = tracer.startSpan(`natsu/${msg.subject}`)

        const subject = msg.subject

        const routeLogger = natsuLogger.child({ subject })
        routeLogger.debug("incoming request")
        if (!router.has(subject)) {
          routeLogger.debug("router cannot handle subject, skipping")
          return
        }

        routeLogger.debug("forward request to router")
        router.call(subject, {
          headers: msg.headers ? (msg.headers as MsgHdrsImpl).toRecord() as any : {},
          body: msg.data.length > 0 ? decode(msg.data) : undefined,
        }, { msg, span })
          .then(result => {
            routeLogger.debug({ result }, 'call completed')
            if (!msg.reply) return

            // const headers = MsgHdrsImpl.fromRecord(result.output.headers as any)
            const body = result.output.body ? encode(JSON.stringify(result.output)) : undefined
            msg.respond(body)
            
            span.setStatus({ code: SpanStatusCode.OK }).end()
          })
          .catch(e => {
            span.recordException(e)
            span.setStatus({ code: SpanStatusCode.ERROR }).end()
          })
      }
    }
  })
})