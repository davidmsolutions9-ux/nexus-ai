import type { FastifyInstance } from 'fastify'
import { getAllProviders } from './providers.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'

export async function providersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (_request, reply) => {
    try {
      const providers = await getAllProviders()
      return reply.send(ok(providers))
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
      throw err
    }
  })
}
