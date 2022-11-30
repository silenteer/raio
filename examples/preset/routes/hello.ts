import { CallContext, HandleFn } from "@subsystem/server"

export const handle: HandleFn = async (data: CallContext) => {
  return {
    output: {
      body: {
        hello: 'world'
      }
    }
  }
}