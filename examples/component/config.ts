import { z } from "zod"
import { define, inferDefine } from "raio"

export const config = define.config(async function config() {
  return z.object({
    port: z.number().default(3000)
  }).parse({})
})

export type Config = inferDefine<typeof config>
