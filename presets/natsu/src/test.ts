import { z } from "zod"

const recordSchema = z.record(z.any())

const schema = z.object({
  passthrough: z.function()
  .args(recordSchema)
  .returns(recordSchema.or(z.promise(recordSchema))),
  nonPassthrough: z.function()
  .args(recordSchema)
  .returns(recordSchema.or(z.promise(recordSchema)))
})

const sideEffectFunction = (data: {}) => {
  data['test'] = 'true'
  return data
}

const testingObject = {
  passthrough: sideEffectFunction,
  nonPassthrough: sideEffectFunction
}

const validatedObject = schema.parse(testingObject)

const po = validatedObject.passthrough({ 'a': 'test' })

const npo = validatedObject.nonPassthrough({})

const vo = {}
sideEffectFunction(vo)

console.log({ po, npo, vo })