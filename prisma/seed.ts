import { PrismaClient } from '@prisma/client'
import { PLAN_PRICES, PLAN_CREDITS_PER_DAY, PLAN_ACUS_PER_DAY } from '../src/shared/types'

const prisma = new PrismaClient()

const PLANS = [
  {
    name: 'LITE' as const,
    multiAgentAllowed: false,
    multiAgentDailyLimit: 0,
    avatarLevel: 0,
  },
  {
    name: 'PLUS' as const,
    multiAgentAllowed: false,
    multiAgentDailyLimit: 0,
    avatarLevel: 1,
  },
  {
    name: 'PRO' as const,
    multiAgentAllowed: true,
    multiAgentDailyLimit: 5,
    avatarLevel: 2,
  },
  {
    name: 'MAX' as const,
    multiAgentAllowed: true,
    multiAgentDailyLimit: 20,
    avatarLevel: 3,
  },
  {
    name: 'ENTERPRISE' as const,
    multiAgentAllowed: true,
    multiAgentDailyLimit: 100,
    avatarLevel: 3,
  },
]

const PROVIDERS = [
  // Anthropic
  { provider: 'anthropic', model: 'claude-sonnet-4-6', acuPer1kTokens: 1.2, qualityIndex: 0.92, latencyP95Ms: 800 },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', acuPer1kTokens: 0.3, qualityIndex: 0.78, latencyP95Ms: 400 },
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', acuPer1kTokens: 1.4, qualityIndex: 0.91, latencyP95Ms: 900 },
  { provider: 'openai', model: 'gpt-4o-mini', acuPer1kTokens: 0.25, qualityIndex: 0.76, latencyP95Ms: 350 },
  // Google
  { provider: 'google', model: 'gemini-2.0-flash', acuPer1kTokens: 0.2, qualityIndex: 0.82, latencyP95Ms: 450 },
  { provider: 'google', model: 'gemini-2.5-pro', acuPer1kTokens: 1.6, qualityIndex: 0.93, latencyP95Ms: 1100 },
  // Mistral
  { provider: 'mistral', model: 'mistral-large-latest', acuPer1kTokens: 0.9, qualityIndex: 0.85, latencyP95Ms: 700 },
  // Groq (fast inference)
  { provider: 'groq', model: 'llama-3.3-70b-versatile', acuPer1kTokens: 0.15, qualityIndex: 0.74, latencyP95Ms: 200 },
]

async function main() {
  console.log('Seeding plans…')
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {},
      create: {
        name: plan.name,
        priceEurCents: PLAN_PRICES[plan.name],
        acusPerDay: PLAN_ACUS_PER_DAY[plan.name],
        creditsPerDay: PLAN_CREDITS_PER_DAY[plan.name],
        multiAgentAllowed: plan.multiAgentAllowed,
        multiAgentDailyLimit: plan.multiAgentDailyLimit,
        avatarLevel: plan.avatarLevel,
      },
    })
    console.log(`  ✓ ${plan.name}`)
  }

  console.log('Seeding provider pricing…')
  for (const p of PROVIDERS) {
    await prisma.providerPricing.upsert({
      where: { provider_model: { provider: p.provider, model: p.model } },
      update: { qualityIndex: p.qualityIndex, latencyP95Ms: p.latencyP95Ms },
      create: {
        provider: p.provider,
        model: p.model,
        acuPer1kTokens: p.acuPer1kTokens,
        qualityIndex: p.qualityIndex,
        latencyP95Ms: p.latencyP95Ms,
        loadMultiplier: 1.0,
        errorRate5Min: 0.0,
        priceSignal: 'NORMAL',
        status: 'ACTIVE',
      },
    })
    console.log(`  ✓ ${p.provider}/${p.model}`)
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
