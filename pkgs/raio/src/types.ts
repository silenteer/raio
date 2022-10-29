export type Fn<I = any, O = any> = (input: I) => O
export type PromiseFn<I = any, T = any> = (input: I) => Promise<T>

export type Router = {
  call: PromiseFn,
  has: Fn<any, boolean>
}