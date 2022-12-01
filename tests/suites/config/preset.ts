import { define } from "@subsystem/server"

export const config = define.config(async (callContext) => {
  return {
    test: "test",
    more: {
      challenging: 'something else'
    }
  }
})