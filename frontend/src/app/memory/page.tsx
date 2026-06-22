'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/store/auth'
import { api } from '@/lib/api'

interface Fact {
  id: string
  category: string
  key: string
  value: string
  factDate?: string | null
  isFuture: boolean
  createdAt: string
}

interface Relationship {
  id: string
  name: string
  relationshipType: string
  birthday?: string | null
  notes?: string | null
  lastMentioned?: string | null
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  IDENTITY:      { label: 'Identidad',        icon: '👤' },
  HEALTH:        { label: 'Salud',             icon: '🏥' },
  FINANCES:      { label: 'Finanzas',          icon: '💰' },
  WORK:          { label: 'Trabajo',           icon: '💼' },
  PREFERENCES:   { label: 'Preferencias',      icon: '⭐' },
  EVENTS:        { label: 'Eventos y citas',   icon: '📅' },
  GOALS:         { label: 'Metas',             icon: '🎯' },
  EMOTIONAL:     { label: 'Estado emocional',  icon: '💭' },
  RELATIONSHIPS: { label: 'Datos relacionales',icon: '🤝' },
}

export default function MemoryPage() {
  const router = useRouter()
  const { token, _hasHydrated } = useAuth()

  const [facts, setFacts]                 = useState<Fact[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading]             = useState(true)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!token) { router.push('/login'); return }
    api.memory.profile()
      .then((r) => {
        setFacts(r.facts as Fact[])
        setRelationships(r.relationships as Relationship[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, router, _hasHydrated])

  async function deleteFact(id: string) {
    setDeletingId(id)
    try {
      await api.memory.deleteFact(id)
      setFacts((prev) => prev.filter((f) => f.id !== id))
    } catch {}
    setDeletingId(null)
  }

  async function deleteRelationship(id: string) {
    setDeletingId(id)
    try {
      await api.memory.deleteRelationship(id)
      setRelationships((prev) => prev.filter((r) => r.id !== id))
    } catch {}
    setDeletingId(null)
  }

  // Group facts by category
  const byCategory: Record<string, Fact[]> = {}
  for (const f of facts) {
    if (!byCategory[f.category]) byCategory[f.category] = []
    byCategory[f.category].push(f)
  }

  return (
    <div className="min-h-screen bg-[#111827] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/chat" className="text-gray-500 hover:text-gray-300 transition">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 15l-5-5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Memoria de Nexus</h1>
            <p className="text-sm text-gray-500">Todo lo que Nexus sabe sobre ti</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-blue-500/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {!loading && facts.length === 0 && relationships.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🧠</div>
            <h2 className="text-gray-400 font-medium mb-2">Sin memoria todavía</h2>
            <p className="text-sm text-gray-600">
              Nexus aprenderá sobre ti a medida que charléis.<br />
              La información se extrae automáticamente al finalizar cada chat.
            </p>
            <Link href="/chat" className="inline-block mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl transition">
              Ir al chat
            </Link>
          </div>
        )}

        {/* Facts by category */}
        {Object.entries(byCategory).map(([cat, catFacts]) => {
          const { label, icon } = CATEGORY_LABELS[cat] ?? { label: cat, icon: '📌' }
          return (
            <div key={cat} className="mb-6">
              <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                <span>{icon}</span> {label}
              </h2>
              <div className="flex flex-col gap-2">
                {catFacts.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 px-4 py-3 bg-[#1d2535] rounded-xl border border-white/[0.06] group">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 mb-0.5">{f.key.replace(/_/g, ' ')}</div>
                      <div className="text-sm text-gray-100">{f.value}</div>
                      {f.factDate && (
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {f.isFuture ? '📅 ' : ''}
                          {new Date(f.factDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteFact(f.id)}
                      disabled={deletingId === f.id}
                      className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-600 hover:text-red-400 transition disabled:opacity-30"
                      title="Eliminar este dato"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Relationships */}
        {relationships.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
              <span>👥</span> Personas
            </h2>
            <div className="flex flex-col gap-2">
              {relationships.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3 bg-[#1d2535] rounded-xl border border-white/[0.06] group">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-sm">
                    {r.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-100 font-medium">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.relationshipType}</div>
                    {r.birthday && (
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        🎂 {new Date(r.birthday).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                      </div>
                    )}
                    {r.notes && <div className="text-[11px] text-gray-500 mt-0.5 italic">{r.notes}</div>}
                  </div>
                  <button
                    onClick={() => deleteRelationship(r.id)}
                    disabled={deletingId === r.id}
                    className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-600 hover:text-red-400 transition disabled:opacity-30"
                    title="Eliminar esta persona"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 3h12M5 3V2h4v1M2 3l1 9h8l1-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note */}
        {(facts.length > 0 || relationships.length > 0) && (
          <p className="text-[11px] text-gray-700 text-center mt-8">
            Nexus extrae estos datos automáticamente de tus conversaciones.<br />
            Puedes eliminar cualquier dato en cualquier momento.
          </p>
        )}
      </div>
    </div>
  )
}
