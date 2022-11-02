import { NatsAuthorizationInjection, NatsAuthorize, NatsHandler, NatsInjection, NatsValidate, NatsValidationInjection } from "@silenteer/natsu"
import { NatsService } from "@silenteer/natsu-type"
import { connect, JSONCodec, MsgHdrsImpl } from "nats"
import { MsgImpl } from "nats/lib/nats-base-client/msg"
import { decode, encode } from "nats/lib/nats-base-client/encoders"
import { define, inferDefine, errors, CallData } from "raio"
import { z } from "zod"

type AnyService = NatsService<string, any, any>
type ContextShape = NatsInjection<AnyService>

type LogService = ContextShape['logService']
type NatsUtils = ContextShape['natsService']

const logService: LogService = {
  log: console.log,
  error: console.log,
  info: console.log,
  warn: console.log
}

export const config = define.config(() => {
  const natsConfig = z.object({
    urls: z
      .preprocess(value => {
        if (typeof value === 'string' && value) return value.split(',')
        else return value
      }, z.string().array())
      .default([]),
    user: z.string().optional(),
    pass: z.string().optional()
  })

  return natsConfig.parse({
    urls: process.env.NATS_URLS,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS
  })
})

export type NatsuConfig = inferDefine<typeof config>

export const context = define.context(async (config: NatsuConfig) => {
  const nc = await connect({ servers: config.urls, user: config.user, pass: config.pass })
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
  }
})

export type NatsuContext = inferDefine<typeof context>

export const requestContext = define.requestContext(
  async (data, config: NatsuConfig, context: NatsuContext) => {
    const msg = data.input['msg']

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

export const natsuValidate = (mod: any) => define.handle(async (data: NatsuRequestContext & NatsuContext & CallData) => {
  const fn = (mod.validate || mod.default?.validate) as NatsValidate<AnyService>

  if (!fn) return

  const natsuContext: NatsValidationInjection<AnyService> = {
    ...data, 
    handler: undefined as any,
    ok() { return { code: 'OK' }},
    error(params) { throw errors(params?.code || 400, params?.errors) }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result as any)
})

export const natsuAuthorize = (mod: any) => define.handle(async (data: NatsuRequestContext & NatsuContext & CallData) => {
  const fn = mod.authorize || mod.default?.authorize as NatsAuthorize<AnyService>
  
  if (!fn) return

  const natsuContext: NatsAuthorizationInjection<AnyService> = {
    ...data, 
    handler: undefined as any,
    ok() { return { code: 'OK' }},
    error(error: { code?: number, errors: unknown }) { throw errors(error?.code || 403, error?.errors) }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result)
})

export const natsuHandle = (mod: any) => define.handle(async (data: NatsuRequestContext & NatsuContext & CallData) => {
  const fn = mod.handle || mod.default?.handle

  const natsuContext: NatsAuthorizationInjection<AnyService> = {
    ...data, 
    handler: undefined as any,
    ok() { return { code: 'OK' }},
    error(error: { code?: number, errors: unknown }) { throw errors(error?.code || 403, error?.errors) }
  }

  const result = await fn(data.input, natsuContext)
  if (!['OK', 200].includes(result.code)) natsuContext.error(result)
})

export const handler = define.handler(async (config, mod) => {
  return [natsuValidate(mod), natsuAuthorize(mod), natsuHandle(mod)]
})

export const adaptor = define.adaptor(async (config: NatsuConfig, context: NatsuContext, router) => {
  const nc = context.nc

  nc.subscribe('>', {
    callback(err, msg) {
      if (err) { console.log(err) }
      else if (msg) {
        const subject = msg.subject

        if (!router.has(subject)) return

        router.call(subject, {
          headers: msg.headers ? (msg.headers as MsgHdrsImpl).toRecord() as any : {},
          body: msg.data.length > 0 ? decode(msg.data) : undefined,
          msg
        } as CallData['input'])
        .then(result => {
          if (!msg.reply) return

          const headers = MsgHdrsImpl.fromRecord(result.output.headers as any)
          const body = result.output.body ? encode(JSON.stringify(result.output.body)) : undefined
          msg.respond(body, { headers })
        })
        .catch(console.error)
      }
    }
  })
})