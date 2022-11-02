import { z } from "zod"
import fastify from "fastify"
import { CallData, define, inferDefine } from "raio"

export const config = define.config(() => {
  const schema = z.object({
    port: z.number().default(3000)
  })

  return schema.parse({})
})

export type RaioFastifyConfig = inferDefine<typeof config>

export const adaptor = define.adaptor(async (config: RaioFastifyConfig, router) => {
  const server = fastify({ logger: true })

  server.get('/*', async (req, rep) => {
    const url = req.url.substring(1)
    req.log.info({ url })

    if (router.has(url)) {
      const data: CallData['input'] = {
        headers: req.headers as any,
        body: Object.assign({}, req.params, req.query, req.body)
      }

      const result = await router.call(url, data)

      return rep
        .headers(result.output.headers)
        .send(result.output.body)
    } else {
      return rep.code(404)
        .send()
    }
  })

  server.listen({
    port: config.port
  })
})