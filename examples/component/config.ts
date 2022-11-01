import { z } from "zod"

export async function config() {
  return z.object({
    port: z.number().default(3000)
  }).parse({})
} 

export type Config = Awaited<ReturnType<typeof config>>
