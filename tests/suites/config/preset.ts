import { define } from "@subsystem/server"

export const config = define.config(async () => {
  return {
    more: {
      challenging: 'something else'
    }
  }
})