import { define } from "raio"

export default define.handle(async (context) => {
  throw new Error("Expected error")
})