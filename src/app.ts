import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyCookie from '@fastify/cookie'

import { connectDatabase, disconnectDatabase } from './config/database'
import { authRoutes } from './modules/auth/auth.routes'
import { creditsRoutes } from './modules/credits/credits.routes'
import { orchestratorRoutes } from './modules/orchestrator/orchestrator.routes'
import { providersRoutes } from './modules/providers/providers.routes'
import { billingRoutes } from './modules/billing/billing.routes'
import { conversationRoutes } from './modules/conversations/conversations.routes'
import { memoryRoutes } from './modules/memory/memory.routes'
import { refreshPricingCache } from './modules/providers/providers.service'
import { fail } from './shared/types'
import { AppError } from './shared/utils/errors'
import { logger } from './shared/utils/logger'

// ─── Fastify type augmentation ────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

// ─── Build app ────────────────────────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  // ── Plugins ────────────────────────────────────────────────────────────────

  await app.register(fastifyHelmet, { global: true })

  await app.register(fastifyCors, {
    origin: (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()),
    credentials: true,
  })

  await app.register(fastifyCookie)

  await app.register(fastifyRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  })

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'change_this_secret',
  })

  // ── Auth decorator ─────────────────────────────────────────────────────────

  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send(fail('UNAUTHORIZED', 'Invalid or expired token'))
    }
  })

  // ── Raw body for Stripe webhooks ───────────────────────────────────────────

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done) => {
      _req.rawBody = body
      try {
        done(null, JSON.parse(body.toString()))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── Global error handler ───────────────────────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.details))
    }
    logger.error('Unhandled error', { message: error.message, stack: error.stack })
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Internal server error'))
  })

  // ── Health check ───────────────────────────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Routes ─────────────────────────────────────────────────────────────────

  const prefix = process.env.API_PREFIX ?? '/api/v1'

  await app.register(authRoutes, { prefix: `${prefix}/auth` })
  await app.register(creditsRoutes, { prefix: `${prefix}/credits` })
  await app.register(orchestratorRoutes, { prefix: `${prefix}/orchestrator` })
  await app.register(providersRoutes, { prefix: `${prefix}/providers` })
  await app.register(billingRoutes, { prefix: `${prefix}/billing` })
  await app.register(conversationRoutes, { prefix: `${prefix}/conversations` })
  await app.register(memoryRoutes, { prefix: `${prefix}/memory` })

  return app
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  const host = process.env.HOST ?? '0.0.0.0'
  const port = parseInt(process.env.PORT ?? '3000', 10)

  await connectDatabase()
  logger.info('Database connected')

  await refreshPricingCache()
  logger.info('Pricing cache warmed')

  const refreshInterval = parseInt(process.env.PRICING_REFRESH_INTERVAL_MS ?? '30000', 10)
  setInterval(() => {
    refreshPricingCache().catch((err) => logger.error('Pricing cache refresh failed', err))
  }, refreshInterval)

  const app = await buildApp()

  try {
    await app.listen({ host, port })
    logger.info(`Nexus AI listening on http://${host}:${port}`)
  } catch (err) {
    logger.error('Failed to start server', err)
    await disconnectDatabase()
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down…`)
    await app.close()
    await disconnectDatabase()
    logger.info('Shutdown complete')
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
