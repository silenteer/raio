import { define } from "@subsystem/server"

type HelloService = {
  hello: 'world'
}

export const context = define.context<HelloService>(() => {
  return { hello: 'world' }
})

export const logServiceResolver = define.resolver<HelloService>((input) => {
  return input.config['hello']
})