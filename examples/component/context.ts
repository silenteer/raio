import type { Config } from "./config"
import { type inferDefine, define } from "raio"

export const context = define.context(() => ({}))

export type Context = inferDefine<typeof context>

export const requestContext = define.requestContext(
  async (callContext) => {
    return { hello: 'abc' } 
  }
)

export type RequestContext = inferDefine<typeof requestContext>