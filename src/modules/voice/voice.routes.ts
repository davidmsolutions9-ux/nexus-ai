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

    // Strip markdown so the voice doesn't read "asterisk asterisk" etc.
    const clean = body.data.text
      .replace(/```[\s\S]*?```/g, '')          // code blocks
      .replace(/`[^`]+`/g, '')                 // inline code
      .replace(/#{1,6}\s/g, '')                // headings
      .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
      .replace(/\*([^*]+)\*/g, '$1')           // italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/^\s*[-*]\s/gm, '')             // list bullets
      .replace(/\n{3,}/g, '\n\n')              // excess newlines
      .trim()
      .slice(0, 4000)

    const response = await client.audio.speech.create({
      model: 'tts-1-hd',    // high quality
      voice: 'shimmer',     // soft, natural feminine — best for Spanish
      input: clean,
      speed: 1.0,
    })

    const buffer = Buffer.from(await response.arrayBuffer())

    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'no-store')
      .send(buffer)
  })
}
