import { define } from "@subsystem/server"

import { resolver as testServiceResolver } from "../preset"
import { logServiceResolver } from "../log"

export default define.handle(async (callContext) => {
}, [testServiceResolver, logServiceResolver])