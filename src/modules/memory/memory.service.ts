import { prisma } from '@config/database'
import { callGroqModel } from '@modules/providers/provider-clients'
import { logger } from '@shared/utils/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedFact {
  category: string
  key: string
  value: string
  date?: string | null
  is_future?: boolean
}

interface ExtractedRelationship {
  name: string
  type: string
  birthday?: string | null
  notes?: string | null
}

interface ExtractionResult {
  facts: ExtractedFact[]
  relationships: ExtractedRelationship[]
  obsoletes: string[]
}

// ─── Extract facts from a conversation ───────────────────────────────────────

export async function extractMemoryFromConversation(
  userId: string,
  conversationId: string,
  messages: { role: string; content: string }[],
): Promise<void> {
  if (messages.length < 2) return

  // Only extract from user messages — AI responses may contain invented/fictional data
  const userMessages = messages.filter((m) => m.role === 'user')
  if (userMessages.length === 0) return

  const transcript = userMessages
    .map((m) => `Usuario: ${m.content.slice(0, 400)}`)
    .join('\n')
    .slice(0, 4000)

  const prompt = `Eres un extractor de información personal para Nexus AI.
Analiza la conversación y extrae información concreta sobre el usuario.

Responde SOLO con JSON válido, sin explicaciones:
{
  "facts": [
    {"category": "IDENTITY|HEALTH|RELATIONSHIPS|FINANCES|WORK|PREFERENCES|EVENTS|GOALS|EMOTIONAL",
     "key": "clave_corta",
     "value": "valor concreto",
     "date": "YYYY-MM-DD o null",
     "is_future": true o false}
  ],
  "relationships": [
    {"name": "Nombre", "type": "pareja|hijo|madre|padre|amigo|hermano|colega|médico", "birthday": "YYYY-MM-DD o null", "notes": "algo relevante o null"}
  ],
  "obsoletes": ["claves que ya no son válidas por haber cambiado"]
}

Reglas ESTRICTAS:
- Solo hechos que el USUARIO haya declarado explícitamente. NUNCA inferir, suponer ni extraer de contexto implícito
- Si el usuario pregunta algo o pide una historia/poema, NO extraer datos de esa ficción
- Solo información personal real: nombre, edad, trabajo, ciudad, familia, citas, metas concretas
- NUNCA guardar datos financieros de ejemplos, ejercicios o conversaciones hipotéticas
- "key" debe ser una palabra en minúsculas con guiones bajos (ej: "nombre", "cita_medica")
- Si no hay hechos declarados explícitamente: {"facts":[],"relationships":[],"obsoletes":[]}

Conversación:
${transcript}`

  try {
    const result = await callGroqModel('llama-3.3-70b-versatile', prompt, 600)
    const text = result.text.trim()

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const extracted: ExtractionResult = JSON.parse(jsonMatch[0])

    await Promise.all([
      saveFacts(userId, conversationId, extracted.facts ?? []),
      saveRelationships(userId, extracted.relationships ?? []),
      markObsolete(userId, extracted.obsoletes ?? []),
    ])

    // Generate proactive notifications from future events
    await generateNotifications(userId, extracted.facts ?? [], extracted.relationships ?? [])

    logger.info('Memory extracted', { userId, factsCount: extracted.facts?.length ?? 0 })
  } catch (err) {
    logger.warn('Memory extraction failed', { userId, err: String(err) })
  }
}

// ─── Save facts ───────────────────────────────────────────────────────────────

async function saveFacts(userId: string, sourceConvId: string, facts: ExtractedFact[]) {
  for (const fact of facts) {
    if (!fact.key || !fact.value || !fact.category) continue

    const validCategories = ['IDENTITY','HEALTH','RELATIONSHIPS','FINANCES','WORK','PREFERENCES','EVENTS','GOALS','EMOTIONAL']
    if (!validCategories.includes(fact.category)) continue

    try {
      // Mark previous ACTIVE fact with same key as OBSOLETE
      await prisma.memoryFact.updateMany({
        where: { userId, key: fact.key, status: 'ACTIVE' },
        data: { status: 'OBSOLETE', validUntil: new Date() },
      })

      // Create new ACTIVE fact
      await prisma.memoryFact.create({
        data: {
          userId,
          category: fact.category as any,
          key: fact.key,
          value: fact.value,
          factDate: fact.date ? new Date(fact.date) : null,
          isFuture: fact.is_future ?? false,
          status: 'ACTIVE',
          sourceConvId,
        },
      })
    } catch {
      // skip duplicates or invalid data
    }
  }
}

// ─── Save relationships ───────────────────────────────────────────────────────

async function saveRelationships(userId: string, relationships: ExtractedRelationship[]) {
  for (const rel of relationships) {
    if (!rel.name || !rel.type) continue
    try {
      await prisma.userRelationship.upsert({
        where: { userId_name: { userId, name: rel.name } },
        create: {
          userId,
          name: rel.name,
          relationshipType: rel.type,
          birthday: rel.birthday ? new Date(rel.birthday) : null,
          notes: rel.notes ?? null,
          lastMentioned: new Date(),
        },
        update: {
          relationshipType: rel.type,
          birthday: rel.birthday ? new Date(rel.birthday) : undefined,
          notes: rel.notes ?? undefined,
          lastMentioned: new Date(),
        },
      })
    } catch {
      // skip
    }
  }
}

// ─── Mark obsolete ────────────────────────────────────────────────────────────

async function markObsolete(userId: string, keys: string[]) {
  if (keys.length === 0) return
  await prisma.memoryFact.updateMany({
    where: { userId, key: { in: keys }, status: 'ACTIVE' },
    data: { status: 'OBSOLETE', validUntil: new Date() },
  })
}

// ─── Generate proactive notifications ────────────────────────────────────────
// Disabled: automatic event/birthday notifications from memory facts are unreliable
// without a real-time clock. Only explicit reminders (via /reminders API) are used.
async function generateNotifications(
  _userId: string,
  _facts: ExtractedFact[],
  _relationships: ExtractedRelationship[],
) {
  // no-op
}

// ─── Build compact memory profile for injection ───────────────────────────────

export async function buildMemoryProfile(userId: string): Promise<string> {
  const [facts, relationships, notifications] = await Promise.all([
    prisma.memoryFact.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    }),
    prisma.userRelationship.findMany({
      where: { userId, status: 'active' },
      take: 20,
    }),
    prisma.proactiveNotification.findMany({
      where: { userId, seen: false },
      orderBy: { scheduledFor: 'asc' },
      take: 5,
    }),
  ])

  if (facts.length === 0 && relationships.length === 0) return ''

  const sections: string[] = []

  // Group facts by category
  const byCategory: Record<string, string[]> = {}
  for (const f of facts) {
    if (!byCategory[f.category]) byCategory[f.category] = []
    const dateStr = f.factDate ? ` (${f.factDate.toLocaleDateString('es-ES')})` : ''
    byCategory[f.category].push(`${f.key}: ${f.value}${dateStr}`)
  }

  const categoryLabels: Record<string, string> = {
    IDENTITY: 'Identidad',
    HEALTH: 'Salud',
    FINANCES: 'Finanzas',
    WORK: 'Trabajo',
    PREFERENCES: 'Preferencias',
    EVENTS: 'Eventos y citas',
    GOALS: 'Metas',
    EMOTIONAL: 'Estado emocional',
    RELATIONSHIPS: 'Datos de personas',
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    sections.push(`${categoryLabels[cat] ?? cat}: ${items.join(' | ')}`)
  }

  if (relationships.length > 0) {
    const rels = relationships.map((r) => {
      const bday = r.birthday
        ? ` (cumple ${r.birthday.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })})`
        : ''
      return `${r.name} [${r.relationshipType}]${bday}`
    })
    sections.push(`Personas: ${rels.join(' | ')}`)
  }

  if (notifications.length > 0) {
    sections.push(`AVISOS IMPORTANTES: ${notifications.map((n) => n.message).join(' | ')}`)
  }

  return sections.join('\n')
}

// ─── Get and mark notifications as seen ──────────────────────────────────────

export async function getPendingNotifications(userId: string): Promise<string[]> {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86_400_000)

  // Mark all old unseen notifications as seen (clean up stale ones)
  await prisma.proactiveNotification.updateMany({
    where: { userId, seen: false, scheduledFor: { lt: oneDayAgo } },
    data: { seen: true },
  }).catch(() => {})

  // Only return notifications scheduled within the last 24 hours
  const notifs = await prisma.proactiveNotification.findMany({
    where: { userId, seen: false, scheduledFor: { gte: oneDayAgo } },
    orderBy: { scheduledFor: 'asc' },
    take: 5,
  })
  if (notifs.length === 0) return []

  await prisma.proactiveNotification.updateMany({
    where: { id: { in: notifs.map((n) => n.id) } },
    data: { seen: true },
  })

  return notifs.map((n) => n.message)
}
