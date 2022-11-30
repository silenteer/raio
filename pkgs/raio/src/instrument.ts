import { wrap } from "shimmer"
import util from "util"
import opentelemetry, { Context, Span, SpanOptions, SpanStatusCode } from "@opentelemetry/api"

export const tracer = opentelemetry.trace.getTracer('main')

type InstrumentOptions = {
  parentSpan?: Span
  include?: string[]
  exclude?: string[]
  spanOptions?: SpanOptions
  context?: Context
}

export function createChildSpan(spanName: string, parentSpan: Span, spanOptions?: SpanOptions) {
  const ctx = opentelemetry.trace.setSpan(
    opentelemetry.context.active(),
    parentSpan
  );

  return tracer.startSpan(spanName, spanOptions, ctx)
}

export function instrument(nodules: any, opts?: InstrumentOptions) {
  if (!nodules) return nodules

  if (typeof nodules !== 'object') return nodules

  const names = (opts?.include || Object.keys(nodules))
    .filter(key => typeof nodules[key] === 'function')
    .filter(key => !opts?.exclude?.includes(key))

  names.forEach(name => {
    wrap(nodules, name, function (original) {
      const result = function () {
        const parentSpan = opentelemetry.trace.getActiveSpan() || opts?.parentSpan
        
        const ctx = parentSpan && opentelemetry.trace.setSpan(
          opentelemetry.context.active(),
          parentSpan
        );

        const spanName = original.meta
          ? original.meta.file + '/' + original.meta.name
          : original.name

        const childSpan = tracer.startSpan(spanName || name , opts?.spanOptions, ctx)
        const result = original.apply(this, arguments)

        if (util.types.isPromise(result)) {
          return result
            .then(x => {
              childSpan
                .setStatus({
                  code: SpanStatusCode.OK
                })
                .end()
              return x
            })
            .catch(e => {
              childSpan.recordException(e)
              childSpan.setStatus({
                code: SpanStatusCode.ERROR
              })
                .end()
              throw e
            })
        }

        return result
      }

      return result
    })
  })

}
