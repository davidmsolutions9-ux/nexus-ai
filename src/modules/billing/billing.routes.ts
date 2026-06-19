import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createCheckoutSession, createTopUpSession, handleStripeWebhook } from './billing.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'

export async function billingRoutes(app: FastifyInstance) {
  // Webhook must receive raw body — register before body parser
  app.post(
    '/webhook',
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'] as string
      if (!sig) return reply.status(400).send(fail('MISSING_SIGNATURE', 'Missing Stripe signature'))

      try {
        await handleStripeWebhook((request as FastifyRequest & { rawBody: Buffer }).rawBody, sig)
        return reply.send({ received: true })
      } catch (err) {
        if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
        throw err
      }
    },
  )

  // Authenticated routes below
  app.register(async (authed) => {
    authed.addHook('preHandler', app.authenticate)

    authed.post('/checkout', async (request, reply) => {
      const { sub: userId } = request.user as { sub: string }
      const body = z.object({ planName: z.enum(['LITE', 'PLUS', 'PRO', 'MAX', 'ENTERPRISE']) }).safeParse(request.body)
      if (!body.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input'))

      try {
        const result = await createCheckoutSession(userId, body.data.planName)
        return reply.send(ok(result))
      } catch (err) {
        if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
        throw err
      }
    })

    authed.post('/topup', async (request, reply) => {
      const { sub: userId } = request.user as { sub: string }
      const body = z
        .object({ acuAmount: z.number().positive(), eurCents: z.number().int().positive() })
        .safeParse(request.body)
      if (!body.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input'))

      try {
        const result = await createTopUpSession(userId, body.data.acuAmount, body.data.eurCents)
        return reply.send(ok(result))
      } catch (err) {
        if (err instanceof AppError) return reply.status(err.statusCode).send(fail(err.code, err.message))
        throw err
      }
    })
  })
}
