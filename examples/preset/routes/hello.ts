import { CallData, HandleFn } from "raio"

export const handle: HandleFn = async (data: CallData) => {
  data.output.body = { hello: 'world' }
}