import { z } from "zod"

async function config() {
  return z.object({
    port: z.number().default(3000)
  }).parse({})
}

type Config = Awaited<ReturnType<typeof config>>

export {
  config, type Config
}
