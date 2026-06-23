import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { orchestrate } from './orchestrator.service'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'
import { prisma } from '../../config/database'

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const CompletionSchema = z.object({
  prompt: z.string().min(1).max(32000),
  maxTokens: z.number().int().min(1).max(8192).default(1000),
  sliderMode: z.enum(['ECONOMIC', 'AUTO', 'PRO']).default('AUTO'),
  contextIds: z.array(z.string().uuid()).default([]),
  stream: z.boolean().default(false),
  forceProvider: z.enum(['groq', 'openai', 'anthropic', 'google', 'gemma', 'mixtral']).optional(),
  messages: z.array(ChatMessageSchema).optional(),
  systemPrompt: z.string().max(4000).optional(),
  noMemory: z.boolean().default(false),
})

const REMINDER_INSTRUCTIONS = `
Cuando el usuario pida que le recuerdes algo o le avises a una hora concreta, incluye al FINAL de tu respuesta el siguiente bloque exacto (y nada más después de él):
<!--NEXUS_REMINDER:{"at":"<ISO8601>","msg":"<mensaje breve del recordatorio>"}-->
Donde <ISO8601> es la fecha/hora exacta en UTC cuando debe dispararse el recordatorio, y <msg> es un mensaje claro en español de máximo 100 caracteres. Incluye solo UN bloque por mensaje. No lo incluyas si el usuario no pide recordatorio.`

const REMINDER_RE = /<!--NEXUS_REMINDER:(\{.*?\})-->/s

export async function orchestratorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/complete', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const body = CompletionSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input', body.error.issues))
    }

    // Append reminder capability to system prompt
    const sysWithReminder = (body.data.systemPrompt ?? '') + REMINDER_INSTRUCTIONS

    try {
      const result = await orchestrate({ userId, ...body.data, systemPrompt: sysWithReminder })

      // Parse reminder tag from AI response
      if (result.responseText) {
        const match = REMINDER_RE.exec(result.responseText)
        if (match) {
          try {
            const { at, msg } = JSON.parse(match[1])
            await prisma.proactiveNotification.create({
              data: { userId, message: msg, type: 'reminder', scheduledFor: new Date(at) },
            })
          } catch { /* invalid JSON — ignore */ }
          result.responseText = result.responseText.replace(REMINDER_RE, '').trimEnd()
        }
      }

      return reply.send(ok(result))
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(fail(err.code, err.message, err.details))
      }
      throw err
    }
  })
}
