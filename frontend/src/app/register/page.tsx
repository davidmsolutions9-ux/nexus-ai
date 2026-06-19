'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

const PLANS = [
  { name: 'LITE', price: '9€/mes', credits: '100 créditos/día' },
  { name: 'PLUS', price: '29€/mes', credits: '400 créditos/día' },
  { name: 'PRO', price: '79€/mes', credits: '1.200 créditos/día' },
]

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuth((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [plan, setPlan] = useState('LITE')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold">⚡ Nexus AI</Link>
          <p className="text-gray-400 mt-2">Crea tu cuenta gratis</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Contraseña</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Plan</label>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map((p) => (
                <button
                  key={p.name} type="button" onClick={() => setPlan(p.name)}
                  className={`p-3 rounded-xl border text-center transition ${plan === p.name ? 'bg-indigo-950 border-indigo-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}
                >
                  <div className="text-xs font-semibold">{p.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{p.price}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.credits}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-medium transition mt-2"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Inicia sesión</Link>
        </p>
      </div>
    </main>
  )
}
