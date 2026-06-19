'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/store/auth'
import { api } from '@/lib/api'

type SliderMode = 'ECONOMIC' | 'AUTO' | 'PRO'
type ForceProvider = 'auto' | 'groq' | 'openai' | 'anthropic' | 'google'

interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  credits?: number
  error?: boolean
}

const AI_OPTIONS: { id: ForceProvider; label: string; desc: string; color: string; dot: string }[] = [
  { id: 'auto',      label: 'Auto',      desc: 'Mejor modelo disponible',  color: 'text-indigo-400', dot: 'bg-indigo-400' },
  { id: 'groq',      label: 'Llama',     desc: 'Groq · Llama 3.3 70B',     color: 'text-green-400',  dot: 'bg-green-400'  },
  { id: 'openai',    label: 'ChatGPT',   desc: 'OpenAI · GPT-4o',          color: 'text-emerald-400',dot: 'bg-emerald-400'},
  { id: 'anthropic', label: 'Claude',    desc: 'Anthropic · Sonnet',       color: 'text-orange-400', dot: 'bg-orange-400' },
  { id: 'google',    label: 'Gemini',    desc: 'Google · Gemini Pro',      color: 'text-blue-400',   dot: 'bg-blue-400'   },
]

const QUALITY_LABELS: Record<SliderMode, { label: string; desc: string }> = {
  ECONOMIC: { label: 'Económico', desc: 'Más barato' },
  AUTO:     { label: 'Auto',      desc: 'Equilibrado' },
  PRO:      { label: 'Pro',       desc: 'Máxima calidad' },
}

export default function ChatPage() {
  const router = useRouter()
  const { token, email, logout, _hasHydrated } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sliderMode, setSliderMode] = useState<SliderMode>('AUTO')
  const [selectedAI, setSelectedAI] = useState<ForceProvider>('auto')
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [showRecharge, setShowRecharge] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!token) { router.push('/login'); return }
    api.credits.balance().then((b) => setBalance(b.total)).catch(() => {})
  }, [token, router, _hasHydrated])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || loading) return

    const text = input.trim()
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const result = await api.chat.complete({
        prompt: text,
        sliderMode,
        maxTokens: 1000,
        ...(selectedAI !== 'auto' ? { forceProvider: selectedAI } : {}),
      })
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: result.responseText,
        provider: result.provider,
        model: result.model,
        credits: result.creditCost,
      }])
      setBalance((prev) => prev !== null ? Math.max(0, prev - result.creditCost) : null)
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Error al procesar la solicitud',
        error: true,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const activeAI = AI_OPTIONS.find((a) => a.id === selectedAI)!

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-gray-800 bg-gray-950">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <Link href="/" className="flex items-center gap-2.5 group">
            <XLogo size={22} />
            <span className="font-semibold tracking-wide text-white/90">
              Nexus <span className="text-indigo-400">AI</span>
            </span>
          </Link>
        </div>

        {/* Nuevo chat */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setMessages([])}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Nuevo chat
          </button>
        </div>

        {/* Separador */}
        <div className="px-4 pt-5 pb-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-600">Modelo</span>
        </div>

        {/* Selector de IA */}
        <div className="px-3 flex flex-col gap-1">
          {AI_OPTIONS.map((ai) => (
            <button
              key={ai.id}
              onClick={() => setSelectedAI(ai.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                selectedAI === ai.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${ai.dot} ${selectedAI !== ai.id ? 'opacity-40' : ''}`} />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-none mb-0.5">{ai.label}</div>
                <div className="text-[10px] text-gray-600 truncate">{ai.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Calidad (solo visible en modo auto) */}
        {selectedAI === 'auto' && (
          <>
            <div className="px-4 pt-5 pb-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-600">Calidad</span>
            </div>
            <div className="px-3 flex flex-col gap-1">
              {(['ECONOMIC', 'AUTO', 'PRO'] as SliderMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSliderMode(mode)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition ${
                    sliderMode === mode
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
                  }`}
                >
                  <span>{QUALITY_LABELS[mode].label}</span>
                  <span className="text-[10px] text-gray-600">{QUALITY_LABELS[mode].desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Créditos + recarga */}
        <div className="px-4 pb-4 flex flex-col gap-2 border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Créditos</span>
            <span className="text-sm font-semibold text-indigo-400">
              {balance !== null ? balance.toFixed(0) : '—'}
            </span>
          </div>
          <button
            onClick={() => setShowRecharge(true)}
            className="w-full py-2 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-lg text-indigo-300 transition"
          >
            + Recargar créditos
          </button>
        </div>

        {/* Usuario */}
        <div className="px-4 pb-5 flex items-center justify-between">
          <span className="text-xs text-gray-600 truncate max-w-[140px]">{email}</span>
          <button
            onClick={() => { logout(); router.push('/') }}
            title="Salir"
            className="text-gray-700 hover:text-gray-400 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H2.5A.5.5 0 0 0 2 2.5v9a.5.5 0 0 0 .5.5H5M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header mínimo */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeAI.dot}`} />
            <span className="text-sm text-gray-400">{activeAI.label}</span>
            {selectedAI === 'auto' && (
              <span className="text-xs text-gray-700 ml-1">· {QUALITY_LABELS[sliderMode].label}</span>
            )}
          </div>
          <Link href="/dashboard" className="text-xs text-gray-600 hover:text-gray-400 transition">
            Dashboard →
          </Link>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-6">

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-28 text-center">
                <XLogo size={36} className="mb-5 opacity-20" />
                <h2 className="text-lg font-medium text-gray-400 mb-1">¿En qué puedo ayudarte?</h2>
                <p className="text-sm text-gray-700">
                  {selectedAI === 'auto'
                    ? `Modo automático · ${QUALITY_LABELS[sliderMode].label}`
                    : `${activeAI.label} — ${activeAI.desc}`}
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                    <XLogo size={12} />
                  </div>
                )}
                <div className="max-w-[75%] flex flex-col gap-1">
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : msg.error
                        ? 'bg-red-950/50 border border-red-900/50 text-red-400 rounded-bl-sm'
                        : 'bg-gray-800/70 text-gray-100 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && !msg.error && (msg.model || msg.credits !== undefined) && (
                    <div className="flex items-center gap-2 px-1">
                      {msg.model && (
                        <span className="text-[10px] text-gray-700">
                          {msg.provider}/{msg.model}
                        </span>
                      )}
                      {msg.credits !== undefined && (
                        <span className="text-[10px] text-gray-700">· {msg.credits.toFixed(3)} cr</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <XLogo size={12} />
                </div>
                <div className="px-4 py-3 bg-gray-800/70 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-4 pb-5 pt-3 border-t border-gray-800 shrink-0">
          <form onSubmit={sendMessage} className="max-w-2xl mx-auto">
            <div className="flex items-end gap-3 bg-gray-900 border border-gray-700 focus-within:border-gray-600 rounded-2xl px-4 py-3 transition">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje... (Enter para enviar)"
                disabled={loading}
                rows={1}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 resize-none focus:outline-none leading-relaxed disabled:opacity-50"
                style={{ maxHeight: '160px', overflowY: 'auto' }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M13 1L6 8M13 1L9 13 6 8 1 5l12-4z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-700 mt-2">
              Nexus AI puede cometer errores. Verifica información importante.
            </p>
          </form>
        </div>
      </div>

      {/* ── Modal recarga (mock) ── */}
      {showRecharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-1">Recargar créditos</h3>
            <p className="text-sm text-gray-400 mb-5">Selecciona el paquete que necesitas</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: '500 cr', price: '4,99€' },
                { label: '1.500 cr', price: '12,99€' },
                { label: '5.000 cr', price: '39,99€' },
                { label: '15.000 cr', price: '99,99€' },
              ].map((pack) => (
                <div key={pack.label} className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-600/50 rounded-xl text-center cursor-pointer transition">
                  <div className="text-sm font-semibold mb-0.5">{pack.label}</div>
                  <div className="text-xs text-indigo-400">{pack.price}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mb-4 text-center">Pagos seguros · Stripe · Cancela cuando quieras</p>
            <button
              onClick={() => setShowRecharge(false)}
              className="w-full py-2.5 text-sm text-gray-500 hover:text-white transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function XLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="3" y1="3" x2="21" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="21" y1="3" x2="3" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="3" r="2" fill="#6366f1" />
    </svg>
  )
}
