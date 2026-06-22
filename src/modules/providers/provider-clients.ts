import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'
import type { ChatMessage } from '@shared/types'

// ─── Lazy singletons ──────────────────────────────────────────────────────────

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

// ─── Unified result ───────────────────────────────────────────────────────────

export interface ProviderCallResult {
  text: string
  tokensConsumed: number
  promptTokens: number
  completionTokens: number
}

// ─── Provider calls ───────────────────────────────────────────────────────────

export async function callAnthropicModel(
  model: string,
  prompt: string,
  maxTokens: number,
  messages?: ChatMessage[],
  systemPrompt?: string,
): Promise<ProviderCallResult> {
  const client = getAnthropicClient()

  const msgs: Anthropic.MessageParam[] = messages && messages.length > 0
    ? messages.map((m) => ({ role: m.role, content: m.content }))
    : [{ role: 'user', content: prompt }]

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: msgs,
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
  messages?: ChatMessage[],
  systemPrompt?: string,
): Promise<ProviderCallResult> {
  const client = getOpenAIClient()

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  if (messages && messages.length > 0) {
    msgs.push(...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
  } else {
    msgs.push({ role: 'user', content: prompt })
  }

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: msgs,
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
  messages?: ChatMessage[],
  systemPrompt?: string,
): Promise<ProviderCallResult> {
  const client = getGoogleClient()
  const genModel = client.getGenerativeModel({
    model,
    generationConfig: { maxOutputTokens: maxTokens },
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  })

  if (messages && messages.length > 1) {
    // Multi-turn: use chat
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const chat = genModel.startChat({ history })
    const lastMsg = messages[messages.length - 1]
    const result = await chat.sendMessage(lastMsg.content)
    const text = result.response.text()
    const usage = result.response.usageMetadata
    const promptTokens = usage?.promptTokenCount ?? 0
    const completionTokens = usage?.candidatesTokenCount ?? 0
    return { text, promptTokens, completionTokens, tokensConsumed: promptTokens + completionTokens }
  }

  const result = await genModel.generateContent(prompt)
  const text = result.response.text()
  const usage = result.response.usageMetadata
  const promptTokens = usage?.promptTokenCount ?? 0
  const completionTokens = usage?.candidatesTokenCount ?? 0
  return { text, promptTokens, completionTokens, tokensConsumed: promptTokens + completionTokens }
}

export async function callGroqModel(
  model: string,
  prompt: string,
  maxTokens: number,
  messages?: ChatMessage[],
  systemPrompt?: string,
): Promise<ProviderCallResult> {
  const client = getGroqClient()

  const msgs: Groq.Chat.ChatCompletionMessageParam[] = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
  if (messages && messages.length > 0) {
    msgs.push(...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
  } else {
    msgs.push({ role: 'user', content: prompt })
  }

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: msgs,
  })

  const choice = response.choices[0]
  const raw = choice?.message?.content ?? ''
  // Strip <think>...</think> reasoning blocks (Qwen3, DeepSeek-R1, etc.)
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  return {
    text,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    tokensConsumed: usage.total_tokens,
  }
}
