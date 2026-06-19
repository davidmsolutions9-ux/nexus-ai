import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

// ─── Lazy singletons — only instantiated if the key exists ───────────────────

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null
let _google: GoogleGenerativeAI | null = null
let _groq: Groq | null = null

export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key || key.startsWith('sk-ant-...')) throw new Error('ANTHROPIC_API_KEY not configured')
    _anthropic = new Anthropic({ apiKey: key })
  }
  return _anthropic
}

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY
    if (!key || key === 'sk-...') throw new Error('OPENAI_API_KEY not configured')
    _openai = new OpenAI({ apiKey: key })
  }
  return _openai
}

export function getGoogleClient(): GoogleGenerativeAI {
  if (!_google) {
    const key = process.env.GOOGLE_API_KEY
    if (!key || key === 'AIza...') throw new Error('GOOGLE_API_KEY not configured')
    _google = new GoogleGenerativeAI(key)
  }
  return _google
}

export function getGroqClient(): Groq {
  if (!_groq) {
    const key = process.env.GROQ_API_KEY
    if (!key || key.startsWith('gsk_...')) throw new Error('GROQ_API_KEY not configured')
    _groq = new Groq({ apiKey: key })
  }
  return _groq
}

// ─── Unified call interface ───────────────────────────────────────────────────

export interface ProviderCallResult {
  text: string
  tokensConsumed: number
  promptTokens: number
  completionTokens: number
}

export async function callAnthropicModel(
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<ProviderCallResult> {
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  return {
    text,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    tokensConsumed: response.usage.input_tokens + response.usage.output_tokens,
  }
}

export async function callOpenAIModel(
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<ProviderCallResult> {
  const client = getOpenAIClient()
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const choice = response.choices[0]
  const text = choice?.message?.content ?? ''
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  return {
    text,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    tokensConsumed: usage.total_tokens,
  }
}

export async function callGoogleModel(
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<ProviderCallResult> {
  const client = getGoogleClient()
  const genModel = client.getGenerativeModel({
    model,
    generationConfig: { maxOutputTokens: maxTokens },
  })

  const result = await genModel.generateContent(prompt)
  const text = result.response.text()
  const usage = result.response.usageMetadata

  const promptTokens = usage?.promptTokenCount ?? 0
  const completionTokens = usage?.candidatesTokenCount ?? 0

  return {
    text,
    promptTokens,
    completionTokens,
    tokensConsumed: promptTokens + completionTokens,
  }
}

export async function callGroqModel(
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<ProviderCallResult> {
  const client = getGroqClient()
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const choice = response.choices[0]
  const text = choice?.message?.content ?? ''
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  return {
    text,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    tokensConsumed: usage.total_tokens,
  }
}
