import { CallContext, HandleFn } from "raio"

export const handle: HandleFn = async (data: CallContext) => {
  return {
    output: {
      body: {
        hello: 'world'
      }
    }
  }
}