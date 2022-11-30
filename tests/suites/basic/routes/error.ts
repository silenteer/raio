import { define } from "@raio/server"

export default define.handle(async (context) => {
  throw new Error("Expected error")
})