import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '@config/database'
import { acuToCredits, creditsToAcu, type SliderPreference } from '@shared/types'
import { InsufficientCreditsError, NotFoundError } from '@shared/utils/errors'
import { logger } from '@shared/utils/logger'

dayjs.extend(utc)
dayjs.extend(timezone)

// ─── Credit balance ───────────────────────────────────────────────────────────

export interface CreditBalance {
  planCredits: number
  rechargeCredits: number
  total: number
  nextExpiry: Date | null
}

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  const now = new Date()

  // Sum unexpired CREDIT/RECHARGE transactions minus DEBIT/REFUND
  const rows = await prisma.creditTransaction.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { expiresAt: 'asc' },
  })

  let planCredits = 0
  let rechargeCredits = 0

  for (const row of rows) {
    const amount = Number(row.creditAmount)
    switch (row.type) {
      case 'CREDIT':
        planCredits += amount
        break
      case 'RECHARGE':
        rechargeCredits += amount
        break
      case 'DEBIT':
        // Debit proportionally from plan first, then recharge
        if (planCredits >= amount) {
          planCredits -= amount
        } else {
          rechargeCredits -= amount - planCredits
          planCredits = 0
        }
        break
      case 'REFUND':
        planCredits += amount
        break
      // EXPIRY rows are excluded by the expiresAt filter above
    }
  }

  const nextExpiry = rows.find((r) => r.expiresAt)?.expiresAt ?? null

  return {
    planCredits: Math.max(0, planCredits),
    rechargeCredits: Math.max(0, rechargeCredits),
    total: Math.max(0, planCredits + rechargeCredits),
    nextExpiry,
  }
}

// ─── Debit (FIFO by expiresAt — earliest-expiring consumed first) ─────────────

export async function debitCredits(
  userId: string,
  acuCost: number,
  meta: {
    provider: string
    model: string
    tokensConsumed: number
    sliderMode: SliderPreference
    estimatedAcu: number
  },
): Promise<void> {
  const creditCost = acuToCredits(acuCost)
  const balance = await getCreditBalance(userId)

  if (balance.total < creditCost) {
    throw new InsufficientCreditsError(creditCost, balance.total)
  }

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'DEBIT',
      acuAmount: new Decimal(acuCost.toFixed(4)),
      creditAmount: new Decimal(creditCost.toFixed(4)),
      provider: meta.provider,
      modelUsed: meta.model,
      tokensConsumed: meta.tokensConsumed,
      sliderMode: meta.sliderMode,
      estimatedAcu: new Decimal(meta.estimatedAcu.toFixed(4)),
      actualAcu: new Decimal(acuCost.toFixed(4)),
    },
  })

  // Keep dailyCreditsUsed in sync on the user row
  await prisma.user.update({
    where: { id: userId },
    data: { dailyCreditsUsed: { increment: Math.ceil(creditCost) } },
  })

  logger.info('Credits debited', { userId, creditCost, acuCost, provider: meta.provider })
}

// ─── Top-up / recharge credits (expire 24h after purchase) ───────────────────

export async function rechargeCredits(
  userId: string,
  acuAmount: number,
): Promise<void> {
  const creditAmount = acuToCredits(acuAmount)
  const purchasedAt = new Date()
  const expiresAt = dayjs(purchasedAt).add(24, 'hour').toDate()

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'RECHARGE',
      acuAmount: new Decimal(acuAmount.toFixed(4)),
      creditAmount: new Decimal(creditAmount.toFixed(4)),
      purchasedAt,
      expiresAt,
    },
  })

  logger.info('Credits recharged', { userId, creditAmount, expiresAt })
}

// ─── Daily reset (called by cron at user's 00:00 timezone) ───────────────────

export async function performDailyReset(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { plan: true },
  })
  if (!user) throw new NotFoundError('User')

  const now = new Date()
  const nextReset = dayjs(now).tz(user.timezone).add(1, 'day').startOf('day').toDate()

  // Expire any remaining plan credits from the previous day
  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'EXPIRY',
      acuAmount: new Decimal(0),
      creditAmount: new Decimal(0),
    },
  })

  // Issue fresh plan credits (no expiresAt = they expire at next midnight via dailyResetAt)
  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'CREDIT',
      acuAmount: new Decimal(user.plan.acusPerDay),
      creditAmount: new Decimal(user.plan.creditsPerDay),
    },
  })

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyCreditsUsed: 0,
      dailyResetAt: nextReset,
    },
  })

  logger.info('Daily credits reset', { userId, creditsPerDay: user.plan.creditsPerDay })
}

// ─── Transaction history ──────────────────────────────────────────────────────

export async function getTransactionHistory(
  userId: string,
  page = 1,
  pageSize = 20,
) {
  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.creditTransaction.count({ where: { userId } }),
  ])
  return { transactions, total, page, pageSize }
}
