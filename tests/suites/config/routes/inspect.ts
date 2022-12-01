import { define } from "@subsystem/server"

export default define.handle(async (callContext) => {
  return {
    output: {
      body: {
        config: callContext.config,
        context: callContext.context
      }
    }
  }
})