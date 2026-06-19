import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getCreditBalance, getTransactionHistory } from './credits.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'

export async function creditsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/balance', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    try {
      const balance = await getCreditBalance(userId)
      return reply.send(ok(balance))
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
      throw err
    }
  })

  app.get('/transactions', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const query = z
      .object({ page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20) })
      .safeParse(request.query)

    if (!query.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid query'))

    try {
      const result = await getTransactionHistory(userId, query.data.page, query.data.pageSize)
      return reply.send(ok(result.transactions, { page: result.page, pageSize: result.pageSize, total: result.total }))
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
      throw err
    }
  })
}
