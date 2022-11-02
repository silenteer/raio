import { NatsHandler, NatsInjection } from "@silenteer/natsu"
import { NatsService } from "@silenteer/natsu-type"
import { connect, JSONCodec, MsgHdrsImpl } from "nats"
import { MsgImpl } from "nats/lib/nats-base-client/msg"
import { decode, encode } from "nats/lib/nats-base-client/encoders"
import { define, inferDefine, errors, CallData } from "raio"
import { z } from "zod"

type AnyService = NatsService<string, any, any>
type AnyHandler = NatsHandler<AnyService>
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
  async (data, config: NatsuConfig, context: NatsuContext): Promise<Omit<ContextShape, 'handler'>> => {
    const msg = data.input['msg']

    if (!(msg instanceof MsgImpl)) {
      throw errors.BadRequest('Invalid nats message')
    }

    const natsContext = {
      subject: msg.subject,
      message: msg
    }

    return natsContext
  })

export type RequestContext = inferDefine<typeof requestContext>

export const natsuValidate = (mod: any) => define.handle(async (data) => {
  const fn = mod.validate || mod.default?.validate

  const result = await fn?.(data.input, data)
  if (!result) return

  if (result.code !== 'OK' || result.code !== 200) {
    throw errors.BadRequest()
  }
})

export const natsuAuthorize = (mod: any) => define.handle(async (data) => {
  const fn = mod.authorize || mod.default?.authorize
  const result = await fn?.(data.input, data)
  if (!result) return

  if (result.code !== 'OK' || result.code !== 200) {
    throw errors.Unauthorized()
  }
})

export const natsuHandle = (mod: any) => define.handle(async (data) => {
  const fn = mod.handle || mod.default?.handle

  await fn?.(data.input, data)
    .then(result => data.output = result)
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