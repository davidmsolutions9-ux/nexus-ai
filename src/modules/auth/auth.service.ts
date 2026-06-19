import bcrypt from 'bcrypt'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '@config/database'
import { AppError, NotFoundError, UnauthorizedError } from '@shared/utils/errors'
import { PLAN_CREDITS_PER_DAY, PLAN_ACUS_PER_DAY, type PlanName } from '@shared/types'
import type { RegisterInput, LoginInput } from './auth.schema'

dayjs.extend(utc)
dayjs.extend(timezone)

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10)

function nextMidnightInTz(tz: string): Date {
  return dayjs().tz(tz).add(1, 'day').startOf('day').toDate()
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new AppError('EMAIL_TAKEN', 'Email already registered', 409)

  const plan = await prisma.plan.findUnique({ where: { name: input.planName as PlanName } })
  if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan not found', 404)

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      planId: plan.id,
      dailyCreditsLimit: plan.creditsPerDay,
      timezone: input.timezone,
      dailyResetAt: nextMidnightInTz(input.timezone),
      avatarLevel: plan.avatarLevel,
    },
    select: {
      id: true,
      email: true,
      planId: true,
      avatarLevel: true,
      sliderPreference: true,
      createdAt: true,
    },
  })

  // Grant first day's plan credits immediately on registration
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      type: 'CREDIT',
      acuAmount: new Decimal(plan.acusPerDay),
      creditAmount: new Decimal(plan.creditsPerDay),
    },
  })

  return user
}

export async function validateCredentials(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) throw new UnauthorizedError('Invalid email or password')

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) throw new UnauthorizedError('Invalid email or password')

  return {
    id: user.id,
    email: user.email,
    planId: user.planId,
  }
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { plan: true },
  })
  if (!user) throw new NotFoundError('User')
  return user
}
