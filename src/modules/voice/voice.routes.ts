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

async function elevenLabsTTS(text: string, apiKey: string): Promise<Buffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'cgSgspJ2msm6clMCkdW9' // Jessica

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.80,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs error ${res.status}: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
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
        const buffer = await elevenLabsTTS(clean, elevenKey)
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
