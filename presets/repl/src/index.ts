import { define } from "raio"

import repl from "repl"

export const adaptor = define.adaptor(async (raio, router) => {

  repl.start('> ').context.m = 'hello world'
})