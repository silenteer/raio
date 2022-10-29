import type { RequestContext } from "../context"

async function handle(context: RequestContext) {
  console.log('hello world')
  context.output['body'] = { hello: 'world' }
}

export { handle }