import { CallContext, define } from "@subsystem/server"

const testService = {
  call: () => 'hello'
}

type TestService = {
  testService: typeof testService
}

export const context = define.context<TestService>(async (server) => {
  return { testService }
})

export const resolver = define.resolver<TestService>((input) => {
  return input.context['testService']
})