import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@config/database'
import { ok, fail } from '@shared/types'
import { buildMemoryProfile, getPendingNotifications } from './memory.service'

export async function memoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Get full memory profile
  app.get('/profile', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const [facts, relationships] = await Promise.all([
      prisma.memoryFact.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
      }),
      prisma.userRelationship.findMany({
        where: { userId, status: 'active' },
        orderBy: { name: 'asc' },
      }),
    ])
    return reply.send(ok({ facts, relationships }))
  })

  // Get pending notifications (called on chat open)
  app.get('/notifications', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const messages = await getPendingNotifications(userId)
    return reply.send(ok({ messages }))
  })

  // Delete a memory fact
  app.delete('/facts/:id', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    await prisma.memoryFact.updateMany({
      where: { id, userId },
      data: { status: 'OBSOLETE', validUntil: new Date() },
    })
    return reply.send(ok({ deleted: true }))
  })

  // Update a memory fact value
  app.patch('/facts/:id', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    const body = z.object({ value: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(422).send(fail('VALIDATION_ERROR', 'Invalid input'))
    await prisma.memoryFact.updateMany({
      where: { id, userId },
      data: { value: body.data.value },
    })
    return reply.send(ok({ updated: true }))
  })

  // Delete a relationship
  app.delete('/relationships/:id', async (request, reply) => {
    const { sub: userId } = request.user as { sub: string }
    const { id } = request.params as { id: string }
    await prisma.userRelationship.updateMany({
      where: { id, userId },
      data: { status: 'inactive' },
    })
    return reply.send(ok({ deleted: true }))
  })
}
