import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@config/database'
import { ok, fail } from '@shared/types'
import { AppError } from '@shared/utils/errors'
import { extractMemoryFromConversation } from '@modules/memory/memory.service'

const CreateConversationSchema = z.object({
  title: z.string().min(1).max(100),
})

const AddMessageSchema = z.object({
  role:       z.enum(['user', 'assistant']),
  content:    z.string().min(1),
  sliderMode: z.enum(['ECONOMIC', 'AUTO', 'PRO']).optional(),
  provider:   z.string().optional(),
  model:      z.string().optional(),
  creditCost: z.number().optional(),
})

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // List conversations for the logged-in user
  app.get('/', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const convs = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true, title: true, createdAt: true, updatedAt: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, role: true } },
      },
    })
    return reply.send(ok(convs))
  })

  // Create a new conversation
  app.post('/', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const body = CreateConversationSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input'))

    const conv = await prisma.conversation.create({
      data: { userId, title: body.data.title },
    })
    return reply.status(201).send(ok(conv))
  })

  // Get messages for a conversation
  app.get('/:id/messages', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const conv = await prisma.conversation.findFirst({ where: { id, userId } })
    if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404)

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(ok(messages))
  })

  // Add a message to a conversation
  app.post('/:id/messages', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const body = AddMessageSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input'))

    const conv = await prisma.conversation.findFirst({ where: { id, userId } })
    if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404)

    const [msg] = await prisma.$transaction([
      prisma.conversationMessage.create({
        data: {
          conversationId: id,
          role:      body.data.role,
          content:   body.data.content,
          sliderMode: body.data.sliderMode as any,
          provider:  body.data.provider,
          model:     body.data.model,
          creditCost: body.data.creditCost,
        },
      }),
      prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    ])

    // Auto-extract memory after every assistant message
    if (body.data.role === 'assistant') {
      prisma.conversationMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        take: 40,
      }).then((msgs) => extractMemoryFromConversation(userId, id, msgs)).catch(() => {})
    }

    return reply.status(201).send(ok(msg))
  })

  // Extract memory from a conversation when user closes/switches chat
  app.post('/:id/summarize', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const conv = await prisma.conversation.findFirst({ where: { id, userId } })
    if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404)

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 40,
    })

    if (messages.length < 2) return reply.send(ok({ skipped: true }))

    // Fire extraction in background — don't block the response
    extractMemoryFromConversation(userId, id, messages).catch(() => {})

    return reply.send(ok({ summarized: true }))
  })

  // Delete a conversation
  app.delete('/:id', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const conv = await prisma.conversation.findFirst({ where: { id, userId } })
    if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found', 404)

    await prisma.conversation.delete({ where: { id } })
    return reply.send(ok({ deleted: true }))
  })
}
