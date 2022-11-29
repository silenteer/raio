import { define } from "raio"

export const config = define.config(async () => {
  return {
    more: {
      challenging: 'something else'
    }
  }
})