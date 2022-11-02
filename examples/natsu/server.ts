export {
  config,
  context,
  requestContext,
  handler,
} from "raio.natsu"
import { adaptor as natsuAdaptor, type NatsuContext } from "raio.natsu"
import { define } from "raio"

export const adaptor = define.adaptor(async (config, context: NatsuContext, router) => {
  natsuAdaptor(config, context, router)
})