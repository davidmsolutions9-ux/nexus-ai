import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import OpenAI from 'openai'

const SynthSchema = z.object({
  text: z.string().min(1).max(4000),
})

export async function voiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/synthesize', async (request, reply) => {
    const body = SynthSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ success: false, error: { message: 'Invalid input' } })

    const key = process.env.OPENAI_API_KEY
    if (!key || key === 'sk-...') {
      return reply.status(503).send({ success: false, error: { message: 'TTS not configured' } })
    }

    const client = new OpenAI({ apiKey: key })

    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',        // feminine, clear, neutral
      input: body.data.text,
      speed: 0.9,           // slightly slower = more deliberate
    })

    const buffer = Buffer.from(await response.arrayBuffer())

    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'no-store')
      .send(buffer)
  })
}
