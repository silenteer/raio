import { z } from "zod" 
import fastify from "fastify"
import type { Router, CallData } from "raio"

export async function config() {
  
  const schema = z.object({
    port: z.number().default(3000)
   })
   
  return schema.parse({})
}

export type FastifyConfig = Awaited<ReturnType<typeof config>>

export async function adaptor(config: FastifyConfig, router: Router) {
  const server = fastify({ logger: true })

  server.get('/*', async (req, rep) => {
    const url = req.url.substring(1)
    req.log.info({ url })

    if (router.has(url)) {
      const data: CallData = {
        input: {
          headers: req.headers,
          body: Object.assign({}, req.params, req.query, req.body)
        } as any,
        output: { headers: {}, body: undefined },
        error: undefined
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
}