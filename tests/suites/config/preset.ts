import { define } from "@raio/server"

export const config = define.config(async () => {
  return {
    more: {
      challenging: 'something else'
    }
  }
})