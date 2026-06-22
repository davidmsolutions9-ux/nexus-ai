'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuth((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.auth.login({ email, password })
      setAuth(data.accessToken, data.userId, email)
      router.push('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center justify-center gap-2.5 mb-3">
            <XLogo size={26} />
            <span className="text-lg font-semibold tracking-wide text-white">Nexus <span className="text-blue-400">AI</span></span>
          </Link>
          <p className="text-gray-500 text-sm">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#111827] rounded-2xl border border-white/[0.07] p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-400 text-sm">{error}</div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wide uppercase">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3.5 py-2.5 bg-[#0d1420] border border-white/[0.08] focus:border-blue-500/60 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none transition"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 tracking-wide uppercase">Contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full px-3.5 py-2.5 pr-10 bg-[#0d1420] border border-white/[0.08] focus:border-blue-500/60 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none transition"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                {showPwd ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition disabled:opacity-40 mt-1"
            style={{ background: 'linear-gradient(135deg,#1a48cc,#2a88ff)', boxShadow: '0 0 20px rgba(42,136,255,0.25)' }}
          >
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-5">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="text-blue-400 hover:text-blue-300 transition">Regístrate</Link>
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
        <linearGradient id="lbL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a0a8c0" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#d8ddf0" /><stop offset="100%" stopColor="#707898" />
        </linearGradient>
        <linearGradient id="lbR" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a0a8c0" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#d8ddf0" /><stop offset="100%" stopColor="#707898" />
        </linearGradient>
        <linearGradient id="lgem" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#90d0ff" /><stop offset="40%" stopColor="#1a70ff" /><stop offset="100%" stopColor="#0030b0" />
        </linearGradient>
      </defs>
      <polygon points="5,3 50,44 46,50 3,5" fill="url(#lbL)" />
      <polygon points="95,97 50,56 54,50 97,95" fill="url(#lbL)" />
      <polygon points="95,3 56,50 50,44 97,5" fill="url(#lbR)" />
      <polygon points="5,97 44,50 50,56 3,95" fill="url(#lbR)" />
      <polygon points="50,35 65,50 50,65 35,50" fill="url(#lgem)" />
      <polygon points="50,40 60,50 50,60 40,50" fill="#b0e0ff" opacity="0.5" />
      <polygon points="50,44 56,50 50,56 44,50" fill="white" opacity="0.35" />
    </svg>
  )
}
