import { define } from "raio"
import type { Config } from "./config"
import { z } from "zod"

const log = define.handle(async (data) => {
  console.log('logging', { data })
  return data
})

const handlerSchema = z.object({
  handle: z.function().returns(z.any())
})

export const handler = define.handler((config, mod) => {
  const handler = handlerSchema.parse(mod)
  return [ log, handler.handle, log ]
})
