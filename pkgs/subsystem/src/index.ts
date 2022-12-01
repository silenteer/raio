import { z } from "zod"
import pino from "pino"
import type { UnionToIntersection } from "utility-types"

const logLevel = z
  .enum(['debug', 'info', 'error', 'silent'])
  .optional()
  .default('silent')
  .parse(process.env.LOG_LEVEL)

export const logger = pino({
  level: logLevel
})

export type Fn<I = any, O = any> = (input: I) => O
export type PromiseFn<I = unknown, T = any> = (...input: I[]) => Promise<T>

type Dictionary<T extends any = any> = Record<string, T>

export type CallContext<RequestContext extends Dictionary = Dictionary> = {
  id: string
  config: Dictionary
  context: RequestContext
  input: { headers: Dictionary<string>, body: any }
  output: { headers: Dictionary<string>, body: any, code: number }
  error?: any
  server: Subsystem
  logger: pino.BaseLogger
  instrument(target: any, ...args: any[]): void // intentionally not setting it to be too strict
}

export type ConfigFn<T extends Dictionary> = (server: Subsystem) => Promise<T> | T
export type ContextFn<T extends Dictionary> = (server: Subsystem) => Promise<T> | T
export type HealthCheckFn = (server: Subsystem) => Promise<void> | void

export type HealtcheckResult = {
  status: 'OK' | 'KO',
  errors?: any[]
}

interface Context extends Dictionary { }

export type Subsystem = {
  config: Dictionary
  context: Context
  routes: Array<any>
  getConfig(path: string): unknown
  loadConfig(configFn: ConfigFn<any>): Promise<void>
  loadContext(contextFn: ContextFn<any>): Promise<void>
  healthcheck(): Promise<HealtcheckResult>
  inspect(): Promise<Dictionary>
}

export type RequestContextFn<T extends Dictionary> = (data: CallContext) => Promise<T> | T

export type HandleReturnType = {
  output?: { headers?: Dictionary<string>, body?: any }
  error?: any
} | void

export type HandleFn<RequestContext extends Dictionary = Dictionary> = (data: CallContext<RequestContext>) => Promise<HandleReturnType> | HandleReturnType

export type ModMetadata = { name: string } & Record<string, any>

export type HandlerFn = (server: Subsystem, mod: any, meta: ModMetadata) => Promise<Handler> | Handler
export type Handler = {
  metadata: { name: string } & Record<string, any>
  handle: HandleFn
}

export type AdaptorFn = (server: Subsystem, router: Router) => Promise<void>
export type ErrorFn = (error: any, data: CallContext) => Promise<CallContext['output'] | void>

export type ResolverFn<Output extends Dictionary> = (input: Subsystem | CallContext) => Output

export type Router = {
  call: (path: string, data: CallContext['input'], callConfig?: Dictionary) => Promise<CallContext>,
  has: Fn<any, boolean>,
  healthcheck(): Promise<HealtcheckResult>
  _router: RadixRouter
}

export function defineConfig<T extends Dictionary>(configFn: (server: Subsystem) => Promise<T> | T): ConfigFn<T> { return configFn }
export function defineContext<T extends Dictionary>(contextFn: (server: Subsystem) => Promise<T> | T): ContextFn<T> { return contextFn }

export function defineRequestContext<T extends Dictionary>(requestFn: RequestContextFn<T>) { return requestFn }
export function defineHandler(handlerFn: HandlerFn) { return handlerFn }

type inferResolver<X> = X extends Array<ResolverFn<infer T>>
  ? T extends Dictionary ? T : Dictionary
  : Dictionary

export type ComposeResolvers<Z> = inferResolver<Z> extends Dictionary
  ? UnionToIntersection<inferResolver<Z>> extends Dictionary
    ? UnionToIntersection<inferResolver<Z>>
    : Dictionary
  : Dictionary

export function defineHandle<T,
  T2 extends ComposeResolvers<T>
>(handleFn: HandleFn<T2>, resolvers?: T) {
  if (Array.isArray(resolvers)) {
    if (!handleFn) throw new SyntaxError("invalid handle definition")

    handleFn['resolvers'] = resolvers
    return handleFn
  } else {
    return handleFn
  }
}

export function defineHealthcheck(healthcheckFn: HealthCheckFn) { return healthcheckFn }
export function defineError(errorFn: ErrorFn) { return errorFn }

export function defineAdaptor(adaptorFn: AdaptorFn) { return adaptorFn }
export function defineResolver<Output extends Dictionary>(resolverFn: ResolverFn<Output>) { return resolverFn }

export const define = {
  adaptor: defineAdaptor,
  config: defineConfig,
  context: defineContext,
  requestContext: defineRequestContext,
  handler: defineHandler,
  handle: defineHandle,
  healthcheck: defineHealthcheck,
  error: defineError,
  resolver: defineResolver
}

export type Mod = {
  adaptor?: AdaptorFn
  config?: ConfigFn<any>
  context?: ContextFn<any>
  requestContext?: RequestContextFn<any>
  handler?: HandlerFn
  healthcheck?: HealthCheckFn
  error?: ErrorFn
}

export const defineModule = (mod: Mod) => { return mod }

export type inferDefine<T extends (...args: any[]) => any> = Awaited<ReturnType<T>>

import createHttpError from "http-errors"
import { RadixRouter } from "radix3"
import { Resolver } from "dns"
export { createHttpError as errors }