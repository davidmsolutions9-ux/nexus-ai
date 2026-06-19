import type { FastifyInstance } from 'fastify'
import { RegisterSchema, LoginSchema } from './auth.schema'
import { registerUser, validateCredentials, getUserById } from './auth.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input', body.error.issues))
    }
    try {
      const user = await registerUser(body.data)
      return reply.status(201).send(ok(user))
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(fail(err.code, err.message))
      }
      throw err
    }
  })

  app.post('/login', async (request, reply) => {
    const body = LoginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input', body.error.issues))
    }
    try {
      const user = await validateCredentials(body.data)
      const accessToken = app.jwt.sign(
        { sub: user.id, email: user.email, planId: user.planId },
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
      )
      return reply.send(ok({ accessToken, userId: user.id }))
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(fail(err.code, err.message))
      }
      throw err
    }
  })

  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const payload = request.user as { sub: string }
      try {
        const user = await getUserById(payload.sub)
        return reply.send(
          ok({
            id: user.id,
            email: user.email,
            plan: user.plan.name,
            avatarLevel: user.avatarLevel,
            sliderPreference: user.sliderPreference,
            dailyCreditsUsed: user.dailyCreditsUsed,
            dailyCreditsLimit: user.dailyCreditsLimit,
            dailyResetAt: user.dailyResetAt,
          }),
        )
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send(fail(err.code, err.message))
        }
        throw err
      }
    },
  )
}
