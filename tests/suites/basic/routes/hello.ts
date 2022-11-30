import { define } from "@subsystem/server"

export default define.handle(async (context) => {
  return {
    output: {
      body: 'world'
    }
  }
})