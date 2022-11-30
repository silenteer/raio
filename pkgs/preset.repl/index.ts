import { define } from "@subsystem/server"

import repl from "repl"

export const adaptor = define.adaptor(async (subsystem, router) => {

  const replServer = repl.start({ prompt: '> ' });

  replServer.context.server = subsystem
  replServer.context.router = router

  replServer.defineCommand('inspect', {
    help: 'inspect the running server',
    action(name) {
      replServer.clearBufferedCommand()
      subsystem.inspect().then(result => {
        console.log(result)
        replServer.displayPrompt()
      })
    }
  })

  setTimeout(() => replServer.displayPrompt(), 50)
})