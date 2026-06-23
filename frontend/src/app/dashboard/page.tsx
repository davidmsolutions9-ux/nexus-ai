'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/store/auth'
import { api, type Transaction } from '@/lib/api'

export default function DashboardPage() {
  const router = useRouter()
  const { email, token, logout, _hasHydrated } = useAuth()
  const [balance, setBalance] = useState<{ planCredits: number; rechargeCredits: number; total: number; nextExpiry: string | null } | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!token) { router.push('/login'); return }
    Promise.all([api.credits.balance(), api.credits.transactions()])
      .then(([bal, txs]) => { setBalance(bal); setTransactions(txs ?? []) })
      .catch(() => { logout(); router.push('/login') })
      .finally(() => setLoading(false))
  }, [token, router, logout, _hasHydrated])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'var(--nx-bg)',color:'var(--nx-text)'}}>
      <div style={{color:'var(--nx-text-sub)'}}>Cargando...</div>
    </div>
  )

  return (
    <main className="min-h-screen" style={{background:'var(--nx-bg)',color:'var(--nx-text)'}}>
      <nav className="flex items-center justify-between px-8 py-4 border-b" style={{borderColor:'var(--nx-border)',background:'var(--nx-header)'}}>
        <Link href="/" className="text-lg font-bold" style={{color:'var(--nx-text)'}}>⚡ Nexus AI</Link>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{color:'var(--nx-text-sub)'}}>{email}</span>
          <Link href="/chat" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition">Ir al chat</Link>
          <button onClick={() => { logout(); router.push('/') }} className="text-sm transition" style={{color:'var(--nx-text-sub)'}}>Salir</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold mb-4">Panel de control</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Créditos totales',    value: balance?.total,           color: 'text-indigo-400' },
              { label: 'Créditos del plan',   value: balance?.planCredits,     color: '' },
              { label: 'Créditos de recarga', value: balance?.rechargeCredits, color: '' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-6 rounded-2xl border" style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)'}}>
                <div className="text-sm mb-1" style={{color:'var(--nx-text-sub)'}}>{label}</div>
                <div className={`text-4xl font-bold ${color}`}>{(value ?? 0).toFixed(0)}</div>
                {label === 'Créditos de recarga' && balance?.nextExpiry && (
                  <div className="text-xs text-yellow-500 mt-1">Expiran: {new Date(balance.nextExpiry).toLocaleDateString('es-ES')}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-indigo-800 bg-indigo-950 flex items-center justify-between">
          <div>
            <div className="font-semibold mb-1 text-white">¿Listo para empezar?</div>
            <div className="text-sm text-indigo-300">Chatea con los mejores modelos de IA</div>
          </div>
          <Link href="/chat" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition whitespace-nowrap">
            Abrir chat →
          </Link>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Últimas transacciones</h2>
          {transactions.length === 0 ? (
            <div className="p-8 rounded-2xl border text-center" style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)',color:'var(--nx-text-sub)'}}>
              Aún no hay transacciones. ¡Empieza a chatear!
            </div>
          ) : (
            <div className="rounded-2xl border overflow-hidden" style={{background:'var(--nx-sidebar)',borderColor:'var(--nx-border)'}}>
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 border-b last:border-0" style={{borderColor:'var(--nx-border)'}}>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tx.type === 'DEBIT' ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'}`}>
                      {tx.type}
                    </span>
                    <span className="text-sm" style={{color:'var(--nx-text-sub)'}}>{tx.modelUsed ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${tx.type === 'DEBIT' ? 'text-red-400' : 'text-green-400'}`}>
                      {tx.type === 'DEBIT' ? '-' : '+'}{Number(tx.creditAmount).toFixed(2)} cr
                    </span>
                    <span className="text-xs" style={{color:'var(--nx-text-sub)'}}>{new Date(tx.createdAt).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
