import type { Config } from "./config"
import { type CallData, type inferDefine, define } from "raio"

export const context = define.context(() => ({}))

export type Context = inferDefine<typeof context>

export const requestContext = define.requestContext(
  async (data: CallData, config: Config, context: Context) => {
  return {
    ...context,
    input: {},
    output: {},
    data,
    config
  }
})

export type RequestContext = inferDefine<typeof requestContext>