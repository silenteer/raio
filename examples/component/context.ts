import type { Config } from "./config"

export async function context(config: Config) {
  return {}
}

export type Context = Awaited<ReturnType<typeof context>>

export async function requestContext(data: any, config: Config, context: Context) {
  return {
    ...context,
    input: {},
    output: {},
    data,
    config
  }
}

export type RequestContext = Awaited<ReturnType<typeof requestContext>>