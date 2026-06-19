import Stripe from 'stripe'
import { prisma } from '@config/database'
import { rechargeCredits } from '@modules/credits/credits.service'
import { logger } from '@shared/utils/logger'
import { AppError } from '@shared/utils/errors'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10',
})

// ─── Plans priced in EUR cents ────────────────────────────────────────────────

export async function createCheckoutSession(
  userId: string,
  planName: string,
): Promise<{ url: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404)

  const plan = await prisma.plan.findUnique({ where: { name: planName as never } })
  if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan not found', 404)

  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: plan.priceEurCents,
          recurring: { interval: 'month' },
          product_data: { name: `Nexus AI ${plan.name}` },
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/success`,
    cancel_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/cancel`,
    metadata: { userId, planId: plan.id },
  })

  return { url: session.url! }
}

// ─── One-off credit top-up ────────────────────────────────────────────────────

export async function createTopUpSession(
  userId: string,
  acuAmount: number,
  eurCents: number,
): Promise<{ url: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404)

  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } })
    customerId = customer.id
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: eurCents,
          product_data: { name: `Nexus AI Top-up (${acuAmount} ACUs)` },
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/topup-success`,
    cancel_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing/cancel`,
    metadata: { userId, acuAmount: String(acuAmount), type: 'topup' },
  })

  return { url: session.url! }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<void> {
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    )
  } catch {
    throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Invalid Stripe webhook signature', 400)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const { userId, acuAmount, type } = session.metadata ?? {}

      if (type === 'topup' && userId && acuAmount) {
        await rechargeCredits(userId, parseFloat(acuAmount))
        logger.info('Top-up completed via Stripe', { userId, acuAmount })
      }

      if (!type && userId && session.metadata?.planId) {
        const plan = await prisma.plan.findUnique({ where: { id: session.metadata.planId } })
        if (plan) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              planId: plan.id,
              dailyCreditsLimit: plan.creditsPerDay,
              avatarLevel: plan.avatarLevel,
              planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
          logger.info('Subscription activated', { userId, plan: plan.name })
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customer = await stripe.customers.retrieve(sub.customer as string)
      if (customer.deleted) break
      const userId = (customer as Stripe.Customer).metadata?.userId
      if (userId) {
        const litePlan = await prisma.plan.findUnique({ where: { name: 'LITE' } })
        if (litePlan) {
          await prisma.user.update({
            where: { id: userId },
            data: { planId: litePlan.id, planExpiresAt: null },
          })
          logger.info('Subscription cancelled — downgraded to LITE', { userId })
        }
      }
      break
    }

    default:
      logger.debug('Unhandled Stripe event', { type: event.type })
  }
}
