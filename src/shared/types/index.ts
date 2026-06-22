import type { FastifyRequest } from 'fastify'

// ─── ACU / Credit conversions ─────────────────────────────────────────────────

export const ACU_TO_CREDIT_RATE = 100 / 75 // 1 ACU = 1.3333... Credits

export function acuToCredits(acu: number): number {
  return (acu * 100) / 75
}

export function creditsToAcu(credits: number): number {
  return (credits * 75) / 100
}

// ─── Enums (mirrors Prisma enums for use outside generated client) ─────────────

export type PlanName = 'LITE' | 'PLUS' | 'PRO' | 'MAX' | 'ENTERPRISE'
export type SliderPreference = 'ECONOMIC' | 'AUTO' | 'PRO'
export type TransactionType = 'DEBIT' | 'CREDIT' | 'REFUND' | 'EXPIRY' | 'RECHARGE'
export type PriceSignal = 'STRATEGIC' | 'LOAD' | 'NORMAL'
export type ProviderStatus = 'ACTIVE' | 'DEGRADED' | 'OFFLINE'
export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'FAILED'
export type ContextType = 'PREFERENCE' | 'PROJECT' | 'RULE' | 'SUMMARY'

// ─── Plan pricing (EUR cents) ──────────────────────────────────────────────────

export const PLAN_PRICES: Record<PlanName, number> = {
  LITE: 900,
  PLUS: 2900,
  PRO: 7900,
  MAX: 14900,
  ENTERPRISE: 21900,
}

export const PLAN_CREDITS_PER_DAY: Record<PlanName, number> = {
  LITE: 100,
  PLUS: 400,
  PRO: 1200,
  MAX: 2500,
  ENTERPRISE: 5000,
}

export const PLAN_ACUS_PER_DAY: Record<PlanName, number> = {
  LITE: 75,
  PLUS: 300,
  PRO: 900,
  MAX: 1875,
  ENTERPRISE: 3750,
}

// ─── Authenticated request ─────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string   // userId
  email: string
  planId: string
  iat?: number
  exp?: number
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload
}

// ─── API response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    page?: number
    pageSize?: number
    total?: number
  }
}

export function ok<T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> {
  return { success: true, data, ...(meta ? { meta } : {}) }
}

export function fail(code: string, message: string, details?: unknown): ApiResponse {
  return { success: false, error: { code, message, details } }
}

// ─── Orchestrator types ───────────────────────────────────────────────────────

export interface ModelCandidate {
  provider: string
  model: string
  acuPer1kTokens: number
  effectiveAcuPer1kTokens: number // after load multiplier
  latencyP95Ms: number
  qualityIndex: number
  status: ProviderStatus
  priceSignal: PriceSignal
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface OrchestrationRequest {
  userId: string
  prompt: string
  maxTokens?: number
  sliderMode: SliderPreference
  contextIds?: string[]
  stream?: boolean
  forceProvider?: string
  messages?: ChatMessage[]   // full conversation history (includes current message)
  systemPrompt?: string      // mode-specific system prompt
  noMemory?: boolean         // if true, skip memory fetch and extraction
}

export interface OrchestrationResult {
  provider: string
  model: string
  tokensConsumed: number
  promptTokens?: number
  completionTokens?: number
  acuCost: number
  creditCost: number
  responseText?: string
  streamId?: string
}
