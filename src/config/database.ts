import { PrismaClient } from '@prisma/client'
import { supabase } from './supabase/client'

// ─── Prisma (primary ORM for all schema-driven operations) ───────────────────

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// ─── Supabase (storage, realtime, auth helpers, edge functions) ───────────────
// Use `supabase` for:
//   • File/image storage  → supabase.storage
//   • Realtime channels   → supabase.channel()
//   • Auth admin ops      → supabase.auth.admin.*
//   • RPC / edge funcs    → supabase.rpc()
// Use `prisma` for all standard CRUD on the schema tables.
export { supabase }

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
