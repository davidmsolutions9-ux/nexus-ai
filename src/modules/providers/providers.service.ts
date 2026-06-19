import { prisma } from '@config/database'
import { logger } from '@shared/utils/logger'
import type { ModelCandidate, SliderPreference } from '@shared/types'

// ─── In-memory cache refreshed on interval ───────────────────────────────────

let pricingCache: ModelCandidate[] = []
let lastRefresh = 0
const REFRESH_INTERVAL = parseInt(process.env.PRICING_REFRESH_INTERVAL_MS ?? '30000', 10)
const MAX_MULTIPLIER = parseFloat(process.env.PRICING_MAX_LOAD_MULTIPLIER ?? '2.5')

export async function refreshPricingCache(): Promise<void> {
  const rows = await prisma.providerPricing.findMany({
    where: { status: { not: 'OFFLINE' } },
  })

  pricingCache = rows.map((r) => {
    const base = Number(r.acuPer1kTokens)
    const mult = Math.min(Number(r.loadMultiplier), MAX_MULTIPLIER)
    return {
      provider: r.provider,
      model: r.model,
      acuPer1kTokens: base,
      effectiveAcuPer1kTokens: base * mult,
      latencyP95Ms: r.latencyP95Ms ?? 500,
      qualityIndex: Number(r.qualityIndex ?? 0.8),
      status: r.status,
      priceSignal: r.priceSignal,
    }
  })

  lastRefresh = Date.now()
  logger.debug('Pricing cache refreshed', { models: pricingCache.length })
}

async function ensureFreshCache(): Promise<void> {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL) {
    await refreshPricingCache()
  }
}

// ─── Model selection by slider mode ──────────────────────────────────────────

export async function selectModel(sliderMode: SliderPreference, forceProvider?: string): Promise<ModelCandidate> {
  await ensureFreshCache()

  if (forceProvider) {
    const forced = pricingCache.find((c) => c.provider === forceProvider && c.status === 'ACTIVE')
    if (forced) return forced
    // forceProvider offline/not found — fall through to auto selection
  }

  const candidates = pricingCache.filter((c) => c.status === 'ACTIVE')
  if (candidates.length === 0) throw new Error('No active providers available')

  switch (sliderMode) {
    case 'ECONOMIC':
      // Cheapest effective cost; tie-break by quality
      return candidates.sort((a, b) =>
        a.effectiveAcuPer1kTokens !== b.effectiveAcuPer1kTokens
          ? a.effectiveAcuPer1kTokens - b.effectiveAcuPer1kTokens
          : b.qualityIndex - a.qualityIndex,
      )[0]!

    case 'PRO':
      // Best quality; tie-break by latency
      return candidates.sort((a, b) =>
        b.qualityIndex !== a.qualityIndex
          ? b.qualityIndex - a.qualityIndex
          : a.latencyP95Ms - b.latencyP95Ms,
      )[0]!

    case 'AUTO':
    default: {
      // Score = quality / (effectiveAcu * latency_factor)
      const scored = candidates.map((c) => ({
        ...c,
        score: c.qualityIndex / (c.effectiveAcuPer1kTokens * (c.latencyP95Ms / 1000 + 1)),
      }))
      return scored.sort((a, b) => b.score - a.score)[0]!
    }
  }
}

export async function getAllProviders(): Promise<ModelCandidate[]> {
  await ensureFreshCache()
  return pricingCache
}

// ─── Update pricing signal (called by monitoring job) ────────────────────────

export async function updateProviderSignal(
  provider: string,
  model: string,
  patch: {
    loadMultiplier?: number
    latencyP95Ms?: number
    errorRate5Min?: number
    qualityIndex?: number
    status?: 'ACTIVE' | 'DEGRADED' | 'OFFLINE'
    priceSignal?: 'STRATEGIC' | 'LOAD' | 'NORMAL'
  },
): Promise<void> {
  const DEGRADED_THRESHOLD = parseFloat(process.env.PRICING_DEGRADED_ERROR_THRESHOLD ?? '0.05')
  const OFFLINE_THRESHOLD = parseFloat(process.env.PRICING_OFFLINE_ERROR_THRESHOLD ?? '0.2')

  let status = patch.status
  if (patch.errorRate5Min !== undefined && !patch.status) {
    if (patch.errorRate5Min >= OFFLINE_THRESHOLD) status = 'OFFLINE'
    else if (patch.errorRate5Min >= DEGRADED_THRESHOLD) status = 'DEGRADED'
    else status = 'ACTIVE'
  }

  await prisma.providerPricing.update({
    where: { provider_model: { provider, model } },
    data: { ...patch, ...(status ? { status } : {}) },
  })

  // Force refresh on next request
  lastRefresh = 0
}
