import { define } from "raio"

export const handle = define.handle(async (context) => {

  return {
    output: {
      body: { hello: 'world' }
    }
  }
})