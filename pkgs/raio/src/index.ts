export type Fn<I = any, O = any> = (input: I) => O
export type PromiseFn<I = any, T = any> = (input: I) => Promise<T>

type Dictionary<T extends any = any> = Record<string, T>
export type CallData = {
  input: { headers: Dictionary<string>, body: any },
  output: { headers: Dictionary<string>, body: any },
  error?: any
}

export type ConfigFn<T extends Dictionary> = (config: any) => Promise<T> | T
export type ContextFn<T extends Dictionary, C extends Dictionary = Dictionary> = (config: C) => Promise<T> | T
export type RequestContextFn<
  T extends Dictionary,
  Context extends Dictionary,
  Config extends Dictionary
> = (data: CallData, config: Context, context: Config) => Promise<T> | T

export type HandleFn = (data: CallData) => Promise<void>
export type HandlerFn = (config: CallData, mod: any) => Promise<HandleFn[]> | HandleFn[]

export type AdaptorFn<Config extends Dictionary> = (config: Config, router: Router) => Promise<void>
export type ErrorFn = (error: any, data: CallData) => Promise<void>

export type Router = {
  call: (path: string, data: CallData) => Promise<CallData>,
  has: Fn<any, boolean>
}

export function defineConfig<T extends Dictionary>(configFn: ConfigFn<T>) { return configFn }
export type inferConfig<T> = T extends typeof defineConfig<infer Y> ? Y : never

export function defineContext<T extends Dictionary>(contextFn: ContextFn<T>) { return contextFn }
export type inferContext<T> = T extends typeof defineContext<infer Y> ? Y : never

export function defineRequestContext<T extends Dictionary, Context extends Dictionary, Config extends Dictionary>(requestFn: RequestContextFn<T, Context, Config>) { return requestFn }
export type inferRequestContext<T> = T extends typeof defineRequestContext<infer Y, any, any> ? Y : never

export function defineHandler(handlerFn: HandlerFn) { return handlerFn }
export function defineHandle(handleFn: HandleFn) { return handleFn }

export function defineError(errorFn: ErrorFn) { return errorFn }

export function defineAdaptor<Config extends Dictionary>(adaptorFn: AdaptorFn<Config>) { return adaptorFn }

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