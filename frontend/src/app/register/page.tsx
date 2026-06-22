'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

const PLANS = [
  { id: 'LITE',       label: 'Lite',       price: '9€',    mo: '/mes', credits: '100',   desc: 'Para empezar' },
  { id: 'PLUS',       label: 'Plus',       price: '29€',   mo: '/mes', credits: '400',   desc: 'Uso personal' },
  { id: 'PRO',        label: 'Pro',        price: '79€',   mo: '/mes', credits: '1.333', desc: 'Más popular',  highlight: true },
  { id: 'MAX',        label: 'Max',        price: '149€',  mo: '/mes', credits: '2.666', desc: 'Uso intensivo' },
  { id: 'ENTERPRISE', label: 'Enterprise', price: '219€+', mo: '/mes', credits: '4.000', desc: 'Equipos' },
]

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuth((s) => s.setAuth)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan]         = useState('PLUS')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.auth.register({
        email, password, planName: plan,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      const data = await api.auth.login({ email, password })
      setAuth(data.accessToken, data.userId, email)
      router.push('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const selected = PLANS.find((p) => p.id === plan)!

  return (
    <main className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <XLogo size={26} />
            <span className="text-lg font-semibold tracking-wide text-white">
              Nexus <span className="text-blue-400">AI</span>
            </span>
          </Link>
          <p className="text-gray-500 text-sm">Crea tu cuenta y elige tu plan</p>
        </div>

        <div className="bg-[#111827] rounded-2xl border border-white/[0.07] p-6 flex flex-col gap-5">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wide uppercase">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3.5 py-2.5 bg-[#0d1420] border border-white/[0.08] focus:border-blue-500/60 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none transition"
              placeholder="tu@email.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wide uppercase">Contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                className="w-full px-3.5 py-2.5 pr-10 bg-[#0d1420] border border-white/[0.08] focus:border-blue-500/60 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none transition"
                placeholder="Mínimo 8 caracteres"
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                {showPwd ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          {/* Plan selector */}
          <div>
            <label className="block text-xs text-gray-500 mb-2.5 tracking-wide uppercase">Plan</label>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className={`relative p-3 rounded-xl border text-center transition flex flex-col items-center gap-0.5 ${
                    plan === p.id
                      ? 'border-blue-500/70 bg-blue-600/15'
                      : 'border-white/[0.06] bg-[#0d1420] hover:border-white/15'
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full tracking-wide whitespace-nowrap">
                      Popular
                    </span>
                  )}
                  <span className={`text-[10px] font-bold tracking-wide ${plan === p.id ? 'text-blue-300' : 'text-gray-400'}`}>
                    {p.label}
                  </span>
                  <span className={`text-sm font-bold ${plan === p.id ? 'text-white' : 'text-gray-300'}`}>
                    {p.price}
                  </span>
                  <span className={`text-[9px] ${plan === p.id ? 'text-blue-400' : 'text-gray-600'}`}>
                    {p.credits} cr/día
                  </span>
                </button>
              ))}
            </div>

            {/* Selected plan summary */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0d1420] border border-white/[0.06] rounded-xl">
              <span className="text-xs text-gray-500">Plan seleccionado</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-300 font-medium">{selected.label}</span>
                <span className="text-xs text-blue-400">{selected.credits} cr/día</span>
                <span className="text-xs font-semibold text-white">{selected.price}<span className="text-gray-600 font-normal">/mes</span></span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide text-white transition disabled:opacity-40 disabled:cursor-not-allowed mt-1"
            style={{
              background: 'linear-gradient(135deg, #1a48cc 0%, #2a88ff 100%)',
              boxShadow: '0 0 20px rgba(42,136,255,0.3)',
            }}
          >
            {loading ? 'Creando cuenta...' : `Crear cuenta · ${selected.price}/mes`}
          </button>
        </div>

        <p className="text-center text-sm text-gray-600 mt-5">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 transition">Inicia sesión</Link>
        </p>
      </div>
    </main>
  )
}

function Eye() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOff() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}

function XLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="rbL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a0a8c0" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#d8ddf0" /><stop offset="100%" stopColor="#707898" />
        </linearGradient>
        <linearGradient id="rbR" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a0a8c0" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#d8ddf0" /><stop offset="100%" stopColor="#707898" />
        </linearGradient>
        <linearGradient id="rgem" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#90d0ff" /><stop offset="40%" stopColor="#1a70ff" /><stop offset="100%" stopColor="#0030b0" />
        </linearGradient>
      </defs>
      <polygon points="4,1 50,45 50,55 1,4"   fill="url(#rbL)" />
      <polygon points="96,99 50,55 50,45 99,96" fill="url(#rbL)" />
      <polygon points="96,1 55,50 45,50 99,4"  fill="url(#rbR)" />
      <polygon points="4,99 45,50 55,50 1,96"  fill="url(#rbR)" />
      <polygon points="50,33 67,50 50,67 33,50" fill="url(#rgem)" />
      <polygon points="50,39 61,50 50,61 39,50" fill="#60b8ff" opacity="0.55" />
      <polygon points="50,43 57,50 50,57 43,50" fill="white" opacity="0.30" />
    </svg>
  )
}
