export type Fn<I = any, O = any> = (input: I) => O
export type PromiseFn<I = any, T = any> = (input: I) => Promise<T>

type Dictionary<T extends any = any> = Record<string, T>
export type CallData = {
  input: { headers: Dictionary<string>, body: any },
  output: { headers: Dictionary<string>, body: any },
  error?: any
}

export type ConfigFn = (config: Dictionary) => Promise<Dictionary> | Dictionary
export type ContextFn = (config: Dictionary) => Promise<Dictionary> | Dictionary
export type RequestContextFn = (data: any, config: Dictionary, context: Dictionary) => Promise<Dictionary> | Dictionary

export type HandleFn = (data: CallData) => Promise<void>
export type HandlerFn = (config: Dictionary, mod: any) => HandleFn[]
export type AdaptorFn = (config: Dictionary, router: Router) => Promise<void>
export type Adaptors = Array<AdaptorFn>
export type ErrorFn = (error: any, data: CallData) => Promise<void>

export type Router = {
  call: (path: string, data: CallData) => Promise<CallData>,
  has: Fn<any, boolean>
}