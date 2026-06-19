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

// ─── Main orchestration ───────────────────────────────────────────────────────

export async function orchestrate(
  req: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const { userId, prompt, maxTokens = 1000, sliderMode, contextIds = [] } = req

  // 1. Select optimal model for this slider mode
  const candidate = await selectModel(sliderMode, req.forceProvider)
  if (!candidate) throw new ProviderUnavailableError('all')

  // 2. Estimate cost upfront
  const estimatedTokens = maxTokens + Math.ceil(prompt.length / 4)
  const estimatedAcu = estimateAcu(estimatedTokens, candidate.effectiveAcuPer1kTokens)
  const estimatedCredits = acuToCredits(estimatedAcu)

  // 3. Check balance
  const balance = await getCreditBalance(userId)
  if (balance.total < estimatedCredits) {
    throw new InsufficientCreditsError(estimatedCredits, balance.total)
  }

  // 4. Fetch context (encrypted at rest, decrypted here)
  const context = await fetchRelevantContext(userId, contextIds)

  // 5. Build final prompt with context
  const fullPrompt = context ? `${context}\n\n---\n\n${prompt}` : prompt

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
    providerResult = await callProvider(candidate.provider, candidate.model, fullPrompt, maxTokens)
  } catch (err) {
    logger.warn('Primary provider failed, falling back to Groq', { provider: candidate.provider })
    const groqFallback = (await import('@modules/providers/provider-clients')).callGroqModel
    providerResult = await groqFallback('llama-3.3-70b-versatile', fullPrompt, maxTokens)
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
): Promise<ProviderCallResult> {
  try {
    switch (provider) {
      case 'anthropic':
        return await callAnthropicModel(model, prompt, maxTokens)
      case 'openai':
        return await callOpenAIModel(model, prompt, maxTokens)
      case 'google':
        return await callGoogleModel(model, prompt, maxTokens)
      case 'groq':
        return await callGroqModel(model, prompt, maxTokens)
      case 'mistral':
        // Mistral is OpenAI-compatible — reuse OpenAI SDK with custom baseURL
        return await callOpenAIModel(model, prompt, maxTokens)
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
