import { define } from "raio"
import { z } from "zod"

const inputSchema = z.object({
  left: z.number(),
  right: z.number()
})

export default define.handle(async (callContext) => {
  const input = inputSchema.parse(callContext.input.body)
  return {
    output: {
      body: input.left + input.right
    }
  }
})