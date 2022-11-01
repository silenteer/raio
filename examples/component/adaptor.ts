import { Router } from "raio";
import { Config } from "./config";

import fastify from "fastify"
import { connect, JSONCodec, MsgHdrsImpl } from "nats"

async function fastifyAdaptor(config: Config, router: Router) {
  const server = fastify({ logger: true })

  server.get('/*', async (req, rep) => {
    const url = req.url.substring(1)
    req.log.info({ url })

    if (router.has(url)) {
      const data = {
        headers: req.headers as any,
        body: Object.assign({}, req.params, req.body, req.query),
        req, rep
      }

      const result = await router.call(url, {
        input: data,
        output: { headers: {}, body: undefined }
      })
        .catch(error => { throw error })
      console.log({result})
      return rep.send(result?.['output']?.['body'])
    } else {
      return rep.code(404)
        .send()
    }
  })

  server.listen({
    port: config.port
  })
}

async function natsAdaptor(config: Config, server: Router) {
  const nc = await connect()
  const { encode, decode } = JSONCodec()

  nc.subscribe('>', {
    async callback(err, msg) {
      const { subject, data } = msg

      if (server.has(subject)) {
        const input = {
          headers: msg.headers ? (msg.headers as MsgHdrsImpl).toRecord() as any : undefined,
          body: data.length > 0 ? decode(data) : undefined
        }

        const result = await server.call(subject, {
          input,
          output: { headers: {}, body: undefined }
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
}

async function adaptor(config: Config, server: Router) {
  fastifyAdaptor(config, server)
  natsAdaptor(config, server)
}

export { adaptor }