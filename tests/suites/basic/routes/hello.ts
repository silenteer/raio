import { define } from "@raio/server"

export default define.handle(async (context) => {
  return {
    output: {
      body: 'world'
    }
  }
})