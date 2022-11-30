# getting started

Give this a try
- `yarn add subsystem subsystem.fastify fastify`
- `export const handle = (callContext: CallContext) => { callContext.output.body = 'hello world' } > routes/hello.ts`
- `yarn subsystem -e hello` should see `{ headers: {}, body: 'hello world' }`
- `yarn subsystem -p subsystem.fastify`, wait a little bit and visit `http://localhost:3000/hello`, you should see `hello world` as result

