import { z } from "zod"
import { define, inferDefine } from "raio"

export const configSchema = z.object({
  port: z.number()
})

export const config = define.config(async function config() {
  return configSchema.parse({
    port: process.env.PORT || 3000
  })
})

export type Config = inferDefine<typeof config>
