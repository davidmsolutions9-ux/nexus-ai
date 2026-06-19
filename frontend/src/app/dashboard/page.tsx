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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400">Cargando...</div>
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Topbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <Link href="/" className="text-lg font-bold">⚡ Nexus AI</Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{email}</span>
          <Link href="/chat" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg transition">Ir al chat</Link>
          <button onClick={() => { logout(); router.push('/') }} className="text-sm text-gray-500 hover:text-white transition">Salir</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Balance */}
        <div>
          <h1 className="text-2xl font-bold mb-4">Panel de control</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <div className="text-sm text-gray-400 mb-1">Créditos totales</div>
              <div className="text-4xl font-bold text-indigo-400">{balance?.total.toFixed(0) ?? 0}</div>
            </div>
            <div className="p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <div className="text-sm text-gray-400 mb-1">Créditos del plan</div>
              <div className="text-4xl font-bold">{balance?.planCredits.toFixed(0) ?? 0}</div>
            </div>
            <div className="p-6 bg-gray-900 rounded-2xl border border-gray-800">
              <div className="text-sm text-gray-400 mb-1">Créditos de recarga</div>
              <div className="text-4xl font-bold">{balance?.rechargeCredits.toFixed(0) ?? 0}</div>
              {balance?.nextExpiry && (
                <div className="text-xs text-yellow-500 mt-1">Expiran: {new Date(balance.nextExpiry).toLocaleDateString('es-ES')}</div>
              )}
            </div>
          </div>
        </div>

        {/* Quick action */}
        <div className="p-6 bg-indigo-950 rounded-2xl border border-indigo-800 flex items-center justify-between">
          <div>
            <div className="font-semibold mb-1">¿Listo para empezar?</div>
            <div className="text-sm text-gray-400">Chatea con los mejores modelos de IA</div>
          </div>
          <Link href="/chat" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition whitespace-nowrap">
            Abrir chat →
          </Link>
        </div>

        {/* Transactions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Últimas transacciones</h2>
          {transactions.length === 0 ? (
            <div className="p-8 bg-gray-900 rounded-2xl border border-gray-800 text-center text-gray-500">
              Aún no hay transacciones. ¡Empieza a chatear!
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tx.type === 'DEBIT' ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'}`}>
                      {tx.type}
                    </span>
                    <span className="text-sm text-gray-400">{tx.modelUsed ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-medium ${tx.type === 'DEBIT' ? 'text-red-400' : 'text-green-400'}`}>
                      {tx.type === 'DEBIT' ? '-' : '+'}{Number(tx.creditAmount).toFixed(2)} cr
                    </span>
                    <span className="text-xs text-gray-600">{new Date(tx.createdAt).toLocaleDateString('es-ES')}</span>
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
