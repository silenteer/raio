import { define, logger } from "raio";
import { configSchema } from "./config";

import fastify from "fastify"
import { connect, JSONCodec, MsgHdrsImpl } from "nats"

const fastifyAdaptor = define.adaptor(async function (raio, router) {
  const validatedConfig = configSchema.parse(raio.config)

  const server = fastify({ logger })

  server.get('/*', async (req, rep) => {
    const url = req.url.substring(1)
    req.log.info({ url })

    if (router.has(url)) {
      const data = {
        headers: req.headers as any,
        body: Object.assign({}, req.params, req.body, req.query)
      }

      const result = await router.call(url, data, { id: req.id, req, rep })
        .catch(error => { throw error })
      console.log({result})
      return rep.send(result?.['output']?.['body'])
    } else {
      return rep.code(404)
        .send()
    }
  })

  server.listen({
    port: validatedConfig.port
  })
})

import repl from "repl"

const replAdaptor = define.adaptor(async (raio, router) => {
  const replServer = repl.start('🚀> ')
  replServer.defineCommand('route', {
    help: 'execute route',
    action(args) {
      if (router.has(args)) {
        router.call(args, { headers: {}, body: undefined })
          .then(result => {
            console.log(result.output, '\n')
            replServer.displayPrompt()
          })
      }

      replServer.displayPrompt()
    }
  })

  setTimeout(() => {
    replServer.displayPrompt()
  }, 200)
})

const natsAdaptor =  define.adaptor(async (raio, router) => {
  const nc = await connect()
  const { encode, decode } = JSONCodec()

  nc.subscribe('>', {
    async callback(err, msg) {
      const { subject, data } = msg

      if (router.has(subject)) {
        const input = {
          headers: msg.headers ? (msg.headers as MsgHdrsImpl).toRecord() as any : undefined,
          body: data.length > 0 ? decode(data) : undefined
        }

        const result = await router.call(subject, input, {
          id: `${msg.subject}-${msg.sid}`,
          msg
        })

        if (msg.reply) {
          if (result['output'].body) {
            msg.respond(encode(result.output.body))
          }
          else msg.respond()
        } 
      }
    },
  })
})

export const adaptor = define.adaptor(
  async (raio, router) => {
    fastifyAdaptor(raio, router)
    natsAdaptor(raio, router)
    replAdaptor(raio, router)
  }
)