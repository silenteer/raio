import type { Config } from "./config"
import type { PromiseFn } from "raio"

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

async function handler(
  config: Config, 
  handle: (data: Record<string, any>) => Promise<void>
): Promise<PromiseFn[]> {
  return [ log, handle, log ]
}

export { handler }
