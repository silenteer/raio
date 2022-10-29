import type { Config } from "./config"

async function context(config: Config) {
  return {}
}

type Context = Awaited<ReturnType<typeof context>>

async function requestContext(data: any, config: Config, context: Context) {
  return {
    ...context,
    input: {},
    output: {},
    data,
    config
  }
}

type RequestContext = Awaited<ReturnType<typeof requestContext>>

export {
  context, type Context,
  requestContext, type RequestContext
}