import type { HelloService } from "../services";
import type { NatsHandler } from "@silenteer/natsu";

type Service = Omit<NatsHandler<HelloService>, 'authorize' | 'validate'>

const handle: Service['handle'] = async (data, ctx) => {
  return {
    code: 'OK',
    body: {
      msg: 'hello'
    }
  }
}

export default {
  subject: 'hello',
  handle,
} as Service
