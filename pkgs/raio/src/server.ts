import path from "path"
import glob from "glob"
import { createRouter } from "radix3"
import { z } from "zod"

type ServerConfig = {
  cwd: string
  routeDirs: string
}

const schemas = {
  adaptor: z.object({ adaptor: z.function() }),
  config: z.object({ config: z.function() }),
  context: z.object({
      context: z.function().optional(),
      requestContext: z.function().optional()
    })
    .refine(
      ({ context, requestContext }) => context || requestContext,
      "At least context or requestContext must be provided"
    ),
  handler: z.object({ handler: z.function() }),
  route: z.object({ handle: z.function() })
}

/** check if file is there, load if needed throw Error if module not found */
async function loadModule(
  cwd: string,
  moduleName: 'config' | 'context' | 'handler' | 'route' | 'adaptor',
  required: boolean = false): Promise<any> {

  const moduleFiles = glob.sync(`${moduleName}.[j|t]s`, { cwd })
  console.log("found", { cwd, moduleName, required, moduleFiles })

  if (required && moduleFiles.length === 0) {
    throw new Error(`Expected to have ${moduleName} at ${cwd}`)
  }

  if (moduleFiles.length > 1) {
    throw new Error(`Expected to have only one file of type ${moduleName}`)
  }

  const mod = await import(`${cwd}/${moduleFiles[0]}`)
  const validatedMod = schemas[moduleName].parse(mod)
  return validatedMod
}

async function createServer(serverConfig: ServerConfig = {
  cwd: process.cwd(),
  routeDirs: './routes'
}) {
  const { cwd, routeDirs } = serverConfig
  console.log({ cwd, routeDirs })

  const configMod = await loadModule(cwd, 'config')
  const resolvedConfig = await configMod?.config() || {}

  const contextMod = await loadModule(cwd, 'context')
  const resolvedContext = await contextMod?.context(resolvedConfig) || {}

  const handlerMod = await loadModule(cwd, 'handler')
  const adaptorMod = await loadModule(cwd, 'adaptor', true)

  const router = createRouter()

  const maybeRouteDir = path.join(cwd, routeDirs)
  const maybeRoutes = glob.sync('*.[j|t]s', { cwd: maybeRouteDir })
  console.log(maybeRoutes)

  for (const maybeRoute of maybeRoutes) {
    const mod = await import(path.resolve(maybeRouteDir, maybeRoute))
    schemas.route.passthrough().parse(mod)

    const resolvedFns = await handlerMod.handler(resolvedConfig, mod.handle) as Array<(...args: any[]) => Promise<any>>

    const caller = async (data: any) => {
      const context = await contextMod.requestContext(data, resolvedConfig, resolvedContext)
      for await (const resolvedFn of resolvedFns) {
        console.log('before', { context, resolvedFn })
        await resolvedFn(context)
        console.log('after', { context })
      }
      return context
    }

    const routePath = path.basename(maybeRoute, path.extname(maybeRoute))

    console.log("Adding", { routePath, maybeRoute, caller })
    router.insert(routePath, { caller })
  }

  async function call(route: string, data: any) {
    const { caller } = router.lookup(route) as any
    return caller(data)
  }

  function has(route: string) {
    return router.lookup(route)
  }

  await adaptorMod.adaptor(resolvedConfig, { call, has })
}

export { createServer }