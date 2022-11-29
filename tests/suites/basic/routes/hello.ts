import { define } from "raio"

export default define.handle(async (context) => {
  return {
    output: {
      body: 'world'
    }
  }
})