import { define } from "@raio/server"

import repl from "repl"

export const adaptor = define.adaptor(async (raio, router) => {

  const replServer = repl.start({ prompt: '> ' });

  replServer.context.server = raio
  replServer.context.router = router

  replServer.defineCommand('inspect', {
    help: 'inspect the running server',
    action(name) {
      replServer.clearBufferedCommand()
      raio.inspect().then(result => {
        console.log(result)
        replServer.displayPrompt()
      })
    }
  })

  setTimeout(() => replServer.displayPrompt(), 50)
})