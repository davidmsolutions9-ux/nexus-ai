import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { orchestrate } from './orchestrator.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'

const CompletionSchema = z.object({
  prompt: z.string().min(1).max(32000),
  maxTokens: z.number().int().min(1).max(8192).default(1000),
  sliderMode: z.enum(['ECONOMIC', 'AUTO', 'PRO']).default('AUTO'),
  contextIds: z.array(z.string().uuid()).default([]),
  stream: z.boolean().default(false),
  forceProvider: z.enum(['groq', 'openai', 'anthropic', 'google']).optional(),
})

export async function orchestratorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/complete', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const body = CompletionSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input', body.error.issues))
    }

    try {
      const result = await orchestrate({ userId, ...body.data })
      return reply.send(ok(result))
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(fail(err.code, err.message, err.details))
      }
      throw err
    }
  })
}
