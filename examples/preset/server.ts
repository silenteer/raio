import { z } from "zod"

export { config, adaptor } from "raio.fastify"

function noOps() { }

export function handler(_: any, mod: any) {
  const moduleSchema = z.object({
    handle: z.function(),
    validate: z.function().optional(),
    authorize: z.function().optional()
  })

  const validated = moduleSchema.parse(mod) // use zod may affect the transfer data
  return [
    validated.validate || noOps,
    validated.authorize || noOps,
    validated.handle
  ]
}