import { z } from "zod"

import { define } from "raio"
export { config, adaptor } from "raio.fastify"

const noOps = define.handle(async () => {})

export const handler = define.handler(async (data, mod) => {
  const moduleSchema = z.object({
    handle: z.function().returns(z.promise(z.void())),
    validate: z.function().returns(z.promise(z.void())).optional(),
    authorize: z.function().returns(z.promise(z.void())).optional()
  })

  const validated = moduleSchema.parse(mod) // use zod may affect the transfer data
  return [
    validated.validate || noOps,
    validated.authorize || noOps,
    validated.handle
  ]
})