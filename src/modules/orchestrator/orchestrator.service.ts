import { prisma } from '@config/database'
import { selectModel } from '@modules/providers/providers.service'
import {
  callAnthropicModel,
  callOpenAIModel,
  callGoogleModel,
  callGroqModel,
  type ProviderCallResult,
} from '@modules/providers/provider-clients'
import { debitCredits, getCreditBalance } from '@modules/credits/credits.service'
import { decrypt } from '@shared/utils/encryption'
import { logger } from '@shared/utils/logger'
import { AppError, InsufficientCreditsError, ProviderUnavailableError } from '@shared/utils/errors'
import { acuToCredits, type OrchestrationRequest, type OrchestrationResult } from '@shared/types'

// ─── Cost estimation ──────────────────────────────────────────────────────────

export function estimateAcu(
  estimatedTokens: number,
  acuPer1kTokens: number,
): number {
  return (estimatedTokens / 1000) * acuPer1kTokens
}

// ─── Context retrieval ────────────────────────────────────────────────────────

async function fetchRelevantContext(
  userId: string,
  contextIds: string[],
): Promise<string> {
  if (contextIds.length === 0) return ''

  const contexts = await prisma.userContext.findMany({
    where: {
      id: { in: contextIds },
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { relevanceScore: 'desc' },
    take: 5,
  })

  // Update lastUsedAt for retrieved contexts
  if (contexts.length > 0) {
    await prisma.userContext.updateMany({
      where: { id: { in: contexts.map((c) => c.id) } },
      data: { lastUsedAt: new Date() },
    })
  }

  return contexts
    .map((c) => {
      try {
        return decrypt(c.contentEncrypted)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

// ─── User memory (persists across conversations) ──────────────────────────────

async function fetchUserMemory(userId: string): Promise<string> {
  // Use new structured memory system
  const { buildMemoryProfile } = await import('@modules/memory/memory.service')
  const profile = await buildMemoryProfile(userId)
  if (profile) return profile

  // Fallback to legacy UserContext if no structured memory yet
  const contexts = await prisma.userContext.findMany({
    where: { userId, contextType: 'PREFERENCE' },
    orderBy: { lastUsedAt: 'desc' },
    take: 5,
  })
  if (contexts.length === 0) return ''
  return contexts
    .map((c) => {
      try { return decrypt(c.contentEncrypted) } catch { return '' }
    })
    .filter(Boolean)
    .join('\n')
}

async function extractAndSaveMemory(userId: string, userMessage: string, aiResponse: string): Promise<void> {
  const { callGroqModel } = await import('@modules/providers/provider-clients')
  const extractionPrompt = `Extrae datos personales del siguiente mensaje. Solo responde con los datos encontrados en formato "Clave: Valor." separados por punto. Si no hay ningún dato personal (nombre, edad, profesión, ciudad, hobbies, preferencias concretas), responde solo: "none"

Ejemplos de respuesta correcta:
- "Nombre: David. Edad: 28."
- "Nombre: María. Profesión: médica. Ciudad: Madrid."
- "none"

Mensaje: "${userMessage.slice(0, 600)}"`

  try {
    const result = await callGroqModel('llama-3.1-8b-instant', extractionPrompt, 150)
    const extracted = result.text.trim()
    if (!extracted || extracted.toLowerCase() === 'none' || extracted.length < 5) return

    const { encrypt } = await import('@shared/utils/encryption')

    // Check if similar memory already exists and update it, otherwise create new
    const existing = await prisma.userContext.findFirst({
      where: { userId, contextType: 'PREFERENCE' },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      const existingContent = decrypt(existing.contentEncrypted)
      // Merge: avoid exact duplicates
      if (!existingContent.includes(extracted)) {
        const merged = existingContent + '\n' + extracted
        await prisma.userContext.update({
          where: { id: existing.id },
          data: { contentEncrypted: encrypt(merged), lastUsedAt: new Date() },
        })
      }
    } else {
      await prisma.userContext.create({
        data: {
          userId,
          contextType: 'PREFERENCE',
          contentEncrypted: encrypt(extracted),
          relevanceScore: 0.9,
        },
      })
    }
  } catch {
    // silently fail — memory extraction is best-effort
  }
}

// ─── Query classifier for intelligent routing ─────────────────────────────────

type QueryType = 'GENERAL' | 'CREATIVE' | 'ANALYSIS' | 'CODE'

const GROQ_FREE_MODELS: Record<QueryType, { provider: string; model: string; label: string }> = {
  GENERAL:  { provider: 'groq', model: 'llama-3.3-70b-versatile',              label: 'Llama 3.3 70B · conversación y razonamiento' },
  CREATIVE: { provider: 'groq', model: 'qwen/qwen3-32b',                        label: 'Qwen3 32B · escritura creativa y narrativa' },
  ANALYSIS: { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout · análisis estructurado y datos' },
  CODE:     { provider: 'groq', model: 'llama-3.3-70b-versatile',              label: 'Llama 3.3 70B · código y programación' },
}

const CREATIVE_KEYWORDS = ['poema', 'poem', 'cuento', 'historia', 'relato', 'canción', 'cancion', 'letra', 'guión', 'guion', 'creativ', 'redact', 'escribe una', 'escríbeme', 'narrat', 'ficción', 'ficcion', 'novela', 'marketing', 'slogan', 'eslogan', 'anuncio', 'descripción creativa']
const ANALYSIS_KEYWORDS = ['analiza', 'analiz', 'informe', 'report', 'estadística', 'estadistica', 'datos', 'tabla', 'compara', 'porcentaje', 'tendencia', 'gráfico', 'grafico', 'resumen ejecutivo', 'kpi', 'métrica', 'metrica']
const CODE_KEYWORDS = ['código', 'codigo', 'function', 'def ', 'class ', 'const ', 'var ', 'import ', 'bug', 'error', 'script', 'sql', 'html', 'css', 'python', 'javascript', 'typescript', 'algoritmo', 'programa']

function quickClassify(prompt: string): QueryType | null {
  const lower = prompt.toLowerCase()
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) return 'CODE'
  if (CREATIVE_KEYWORDS.some((k) => lower.includes(k))) return 'CREATIVE'
  if (ANALYSIS_KEYWORDS.some((k) => lower.includes(k))) return 'ANALYSIS'
  return null
}

async function classifyQuery(prompt: string): Promise<QueryType> {
  // Fast keyword pre-classification (no API cost)
  const quick = quickClassify(prompt)
  if (quick) {
    logger.info('Quick classify', { type: quick, prompt: prompt.slice(0, 80) })
    return quick
  }

  // Fallback: Groq micro-model classification
  const classPrompt = `Clasifica esta consulta en UNA sola palabra. Responde SOLO con una de estas: GENERAL, CREATIVE, ANALYSIS, CODE
- CREATIVE: poemas, historias, guiones, redacción creativa, canciones
- ANALYSIS: datos, estadísticas, informes, tablas, comparativas
- CODE: código, programación, bugs, scripts, algoritmos
- GENERAL: todo lo demás
Consulta: "${prompt.slice(0, 200)}"
Responde SOLO con la palabra:`

  try {
    const result = await callGroqModel('llama-3.1-8b-instant', classPrompt, 5)
    const word = result.text.trim().toUpperCase().split(/\s/)[0]
    if (word === 'CREATIVE' || word === 'ANALYSIS' || word === 'CODE') return word
    return 'GENERAL'
  } catch {
    return 'GENERAL'
  }
}

// ─── Main orchestration ───────────────────────────────────────────────────────

export async function orchestrate(
  req: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const { userId, prompt, maxTokens = 1000, sliderMode, contextIds = [], messages, systemPrompt, noMemory = false } = req

  // 1. Select optimal model
  // In AUTO mode without forceProvider: classify the query and pick the best free model
  let smartProvider: string | undefined
  let smartModel: string | undefined
  let smartLabel: string | undefined

  if (sliderMode === 'AUTO' && !req.forceProvider) {
    const queryType = await classifyQuery(prompt)
    const chosen = GROQ_FREE_MODELS[queryType]
    smartProvider = chosen.provider
    smartModel = chosen.model
    smartLabel = chosen.label
    logger.info('Smart routing', { queryType, model: chosen.model })
  }

  // Build a mutable candidate — never mutate the pricing cache directly
  const baseCandidate = await selectModel(sliderMode, req.forceProvider)
  if (!baseCandidate) throw new ProviderUnavailableError('all')

  const candidate = { ...baseCandidate }   // shallow copy — safe to mutate

  if (smartModel && smartProvider) {
    candidate.model = smartModel
    candidate.provider = smartProvider
  }

  // 2. Estimate cost upfront
  const estimatedTokens = maxTokens + Math.ceil(prompt.length / 4)
  const estimatedAcu = estimateAcu(estimatedTokens, candidate.effectiveAcuPer1kTokens)
  const estimatedCredits = acuToCredits(estimatedAcu)

  // 3. Check balance
  const balance = await getCreditBalance(userId)
  if (balance.total < estimatedCredits) {
    throw new InsufficientCreditsError(estimatedCredits, balance.total)
  }

  // 4. Fetch context (encrypted at rest, decrypted here) + user memory
  const [context, userMemory] = await Promise.all([
    fetchRelevantContext(userId, contextIds),
    noMemory ? Promise.resolve('') : fetchUserMemory(userId),
  ])

  // 5. Build final prompt with context
  const fullPrompt = context ? `${context}\n\n---\n\n${prompt}` : prompt

  const routingReason = smartLabel ? ` El orquestador de Nexus AI te eligió para esta consulta porque eres especialista en: ${smartLabel}.` : ''
  const modelLine = `Eres Nexus AI. El modelo de IA que estás ejecutando en esta respuesta es: ${candidate.provider} / ${candidate.model}.${routingReason} Si el usuario pregunta qué modelo eres o por qué te eligió el orquestador, responde con este dato exacto. NUNCA digas que eres un modelo diferente al indicado aquí.`
  const fullSystemPrompt = systemPrompt ? `${systemPrompt}\n\n${modelLine}` : modelLine

  // Memory injection strategy: prepend profile to the FIRST user message of the conversation.
  // We frame it as info the user is sharing NOW (not as "past conversations") to avoid
  // triggering Llama's hardcoded refusal of "I don't have memory."
  type CM = import('@shared/types').ChatMessage
  let fullMessages: CM[] | undefined

  if (messages && messages.length > 0) {
    if (userMemory) {
      // Inject profile into the first user message only
      const [firstMsg, ...rest] = messages
      const augmented: CM = {
        role: 'user',
        content: `[Contexto personal del usuario para que puedas personalizar tu respuesta de forma natural. Úsalo con sutileza — no lo enumeres ni lo cites literalmente, solo déjate guiar por él cuando sea relevante:\n${userMemory}]\n\n${firstMsg.content}`,
      }
      fullMessages = [augmented, ...rest]
    } else {
      fullMessages = messages
    }
  } else if (userMemory) {
    // Single-turn with memory: prepend profile to the prompt itself
    fullMessages = [{
      role: 'user',
      content: `[Contexto personal del usuario para que puedas personalizar tu respuesta de forma natural. Úsalo con sutileza — no lo enumeres ni lo cites literalmente, solo déjate guiar por él cuando sea relevante:\n${userMemory}]\n\n${prompt}`,
    }]
  }

  logger.info('Routing request', {
    userId,
    provider: candidate.provider,
    model: candidate.model,
    sliderMode,
    estimatedAcu,
  })

  // 6. Call the provider with Groq fallback
  let providerResult: ProviderCallResult
  let finalProvider = candidate.provider
  let finalModel = candidate.model
  try {
    providerResult = await callProvider(candidate.provider, candidate.model, fullPrompt, maxTokens, fullMessages, fullSystemPrompt)
  } catch (err) {
    logger.warn('Primary provider failed, falling back to Groq', { provider: candidate.provider })
    const groqFallback = (await import('@modules/providers/provider-clients')).callGroqModel
    providerResult = await groqFallback('llama-3.3-70b-versatile', fullPrompt, maxTokens, fullMessages, fullSystemPrompt)
    finalProvider = 'groq'
    finalModel = 'llama-3.3-70b-versatile'
  }

  // 7. Compute actual ACU cost from real token usage
  const actualAcu = (providerResult.tokensConsumed / 1000) * candidate.effectiveAcuPer1kTokens

  // 8. Debit credits
  await debitCredits(userId, actualAcu, {
    provider: finalProvider,
    model: finalModel,
    tokensConsumed: providerResult.tokensConsumed,
    sliderMode,
    estimatedAcu,
  })

  // 9. Memory extraction happens at conversation end (via /summarize endpoint), not per-message

  return {
    provider: finalProvider,
    model: finalModel,
    tokensConsumed: providerResult.tokensConsumed,
    promptTokens: providerResult.promptTokens,
    completionTokens: providerResult.completionTokens,
    acuCost: actualAcu,
    creditCost: acuToCredits(actualAcu),
    responseText: providerResult.text,
  }
}

// ─── Provider dispatcher ──────────────────────────────────────────────────────

async function callProvider(
  provider: string,
  model: string,
  prompt: string,
  maxTokens: number,
  messages?: import('@shared/types').ChatMessage[],
  systemPrompt?: string,
): Promise<ProviderCallResult> {
  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropicModel(model, prompt, maxTokens, messages, systemPrompt)
      case 'openai':
        return await callOpenAIModel(model, prompt, maxTokens, messages, systemPrompt)
      case 'google':
        return await callGoogleModel(model, prompt, maxTokens, messages, systemPrompt)
      case 'groq':
        return await callGroqModel(model, prompt, maxTokens, messages, systemPrompt)
      case 'gemma':
        return await callGroqModel('qwen/qwen3-32b', prompt, maxTokens, messages, systemPrompt)
      case 'mixtral':
        return await callGroqModel('meta-llama/llama-4-scout-17b-16e-instruct', prompt, maxTokens, messages, systemPrompt)
      case 'mistral':
        return await callOpenAIModel(model, prompt, maxTokens, messages, systemPrompt)
      default:
        throw new AppError('UNKNOWN_PROVIDER', `Provider "${provider}" not implemented`, 501)
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    const message = err instanceof Error ? err.message : String(err)
    logger.error('Provider call failed', { provider, model, message })
    throw new ProviderUnavailableError(provider)
  }
}
