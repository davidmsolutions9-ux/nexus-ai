import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import OpenAI from 'openai'

const SynthSchema = z.object({
  text: z.string().min(1).max(4000),
})

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*]\s/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}

export async function voiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/synthesize', async (request, reply) => {
    const body = SynthSchema.safeParse(request.body)
    if (!body.success) return reply.status(422).send({ success: false, error: { message: 'Invalid input' } })

    const clean = stripMarkdown(body.data.text)

    // ── ElevenLabs (preferred) ────────────────────────────────────────────────
    const elevenKey = process.env.ELEVENLABS_API_KEY
    if (elevenKey) {
      try {
        const { ElevenLabsClient } = await import('elevenlabs')
        const client = new ElevenLabsClient({ apiKey: elevenKey })

        const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'cgSgspJ2msm6clMCkdW9' // "Jessica" — warm feminine, multilingual

        const audioStream = await client.textToSpeech.convert(voiceId, {
          text: clean,
          modelId: 'eleven_multilingual_v2',
          outputFormat: 'mp3_44100_128',
          voiceSettings: {
            stability: 0.45,
            similarityBoost: 0.80,
            style: 0.35,
            useSpeakerBoost: true,
          },
        })

        // Collect stream into buffer
        const chunks: Buffer[] = []
        for await (const chunk of audioStream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const buffer = Buffer.concat(chunks)

        return reply
          .header('Content-Type', 'audio/mpeg')
          .header('Cache-Control', 'no-store')
          .send(buffer)
      } catch {
        // Fall through to OpenAI
      }
    }

    // ── OpenAI TTS fallback ───────────────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey || openaiKey === 'sk-...') {
      return reply.status(503).send({ success: false, error: { message: 'TTS not configured' } })
    }

    const client = new OpenAI({ apiKey: openaiKey })
    const response = await client.audio.speech.create({
      model: 'tts-1-hd',
      voice: 'shimmer',
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
