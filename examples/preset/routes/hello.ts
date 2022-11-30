import { CallContext, HandleFn } from "@raio/server"

export const handle: HandleFn = async (data: CallContext) => {
  return {
    output: {
      body: {
        hello: 'world'
      }
    }
  }
}