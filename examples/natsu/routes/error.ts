import type { ErrorService } from "../services";
import type { NatsHandler } from "@silenteer/natsu";

type Service = NatsHandler<ErrorService>

const handle: Service['handle'] = async (data, ctx) => {
  throw new Error('intended error')
}

const validate: Service['validate'] = async (data, ctx) => {
  return {
    code: 'OK'
  }
}

export default {
  subject: 'error',
  handle,
  validate
}
