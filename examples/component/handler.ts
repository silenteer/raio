import type { PromiseFn, Fn, HandlerFn } from "raio"
import type { Config } from "./config"
import { z } from "zod"

async function log(context: Record<string, any>) {
  console.log('logging', { context })
}

async function parse(context: Record<string, any>) {
  const input = JSON.parse(context.data)
  context.input = input
}

async function serialize(context: Record<string, any>) {
  const output = JSON.stringify(context.output)
  context.output = output
}

const handlerSchema = z.object({
  handle: z.function()
})

export async function handler(
  config: Config, 
  mod: any
) {
  const handler = handlerSchema.parse(mod)
  return [ log, handler.handle, log ]
}