import { define } from "@subsystem/server"

export default define.handle(async (context) => {
  throw new Error("Expected error")
})