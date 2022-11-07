
/** Type intention
 * 
 *  server -> call -> call -> call -> ready to go -> start trigger, sharing the same instance, if you need to verify, verify it
 *                                                        ⬇️
 *                                                   request coming -> call -> call -> call -> return result
 * 
 */

import { z } from "zod"
import pino from "pino"

const logLevel = z
  .enum(['debug', 'info', 'error'])
  .optional()
  .default('info')
  .parse(process.env.LOG_LEVEL)
  
export const logger = pino({ level: logLevel })

export type Raio = {
  config: Dictionary
  context: Dictionary
  routes: Array<any>
}

export type Fn<I = any, O = any> = (input: I) => O
export type PromiseFn<I = any, T = any> = (input: I) => Promise<T>

type Dictionary<T extends any = any> = Record<string, T>
export type CallContext = {
  id: string
  config: Dictionary
  context: Dictionary
  input: { headers: Dictionary<string>, body: any }
  output: { headers: Dictionary<string>, body: any }
  error?: any
  server: Raio
}

export type ConfigFn<T extends Dictionary> = (server: Raio) => Promise<T> | T
export type ContextFn<T extends Dictionary> = (server: Raio) => Promise<T> | T

export type RequestContextFn<T extends Dictionary> = (data: CallContext) => Promise<T> | T

export type HandleReturnType = {
  output?: { headers?: Dictionary<string>, body?: any }
  error?: any
} | void

export type HandleFn = (data: CallContext) => Promise<HandleReturnType> | HandleReturnType

export type ModMetadata = { name: string } & Record<string, any>
export type HandlerFn = (server: Raio, mod: any, meta: ModMetadata) => Promise<HandleFn[]> | HandleFn[]

export type AdaptorFn = (server: Raio, router: Router) => Promise<void>
export type ErrorFn = (error: any, data: CallContext) => Promise<void>

export type Router = {
  call: (path: string, data: CallContext['input'], callConfig?: Dictionary) => Promise<CallContext>,
  has: Fn<any, boolean>
}

export function defineConfig<T extends Dictionary>(configFn: (server: Raio) => Promise<T> | T): ConfigFn<T> { return configFn }
export function defineContext<T extends Dictionary>(contextFn: (server: Raio) => Promise<T> | T): ContextFn<T> { return contextFn }

export function defineRequestContext<T extends Dictionary>(requestFn: RequestContextFn<T>) { return requestFn }
export function defineHandler(handlerFn: HandlerFn) { return handlerFn }
export function defineHandle(handleFn: HandleFn) { return handleFn }

export function defineError(errorFn: ErrorFn) { return errorFn }

export function defineAdaptor(adaptorFn: AdaptorFn) { return adaptorFn }

export const define = {
  adaptor: defineAdaptor,
  config: defineConfig,
  context: defineContext,
  requestContext: defineRequestContext,
  handler: defineHandler,
  handle: defineHandle,
  error: defineError
}

export type inferDefine<T extends (...args: any[]) => any> = Awaited<ReturnType<T>>

import createHttpError from "http-errors"
export { createHttpError as errors }