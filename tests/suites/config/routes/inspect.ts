import { define } from "@raio/server"

export default define.handle(async (callContext) => {
  console.log(callContext.server.getConfig('more'))
  return {
    output: {
      body: {
        config: callContext.config,
        context: callContext.context
      }
    }
  }
})