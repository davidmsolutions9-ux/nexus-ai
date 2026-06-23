import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../config/database'

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth:   z.string(),
  }),
})

const CreateReminderSchema = z.object({
  message:      z.string().min(1).max(500),
  scheduledFor: z.string().datetime(),
})

export async function remindersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // Save browser push subscription
  app.post('/push-subscribe', async (req, reply) => {
    const body = SubscribeSchema.safeParse(req.body)
    if (!body.success) return reply.status(422).send({ success: false })

    const userId = (req.user as any).sub
    await prisma.pushSubscription.upsert({
      where:  { endpoint: body.data.endpoint },
      create: { userId, endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth },
      update: { userId, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth },
    })
    return reply.status(200).send({ success: true })
  })

  // Create reminder
  app.post('/', async (req, reply) => {
    const body = CreateReminderSchema.safeParse(req.body)
    if (!body.success) return reply.status(422).send({ success: false })

    const userId = (req.user as any).sub
    const reminder = await prisma.proactiveNotification.create({
      data: {
        userId,
        message:     body.data.message,
        type:        'reminder',
        scheduledFor: new Date(body.data.scheduledFor),
      },
    })
    return reply.status(201).send({ success: true, data: reminder })
  })

  // List upcoming reminders
  app.get('/', async (req, reply) => {
    const userId = (req.user as any).sub
    const reminders = await prisma.proactiveNotification.findMany({
      where:   { userId, seen: false, scheduledFor: { gte: new Date() } },
      orderBy: { scheduledFor: 'asc' },
      take:    20,
    })
    return reply.send({ success: true, data: reminders })
  })

  // Delete reminder
  app.delete('/:id', async (req, reply) => {
    const userId = (req.user as any).sub
    const { id } = req.params as { id: string }
    await prisma.proactiveNotification.deleteMany({ where: { id, userId } })
    return reply.send({ success: true })
  })
}
