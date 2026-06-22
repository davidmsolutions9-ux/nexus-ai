'use client'
import { useState, useEffect } from 'react'

const SESSION_KEY = 'nexus_demo_auth'
const DEMO_PASSWORD = 'NexusXRPL2026'

export default function DemoGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed]   = useState(false)
  const [checked, setChecked] = useState(false)
  const [input, setInput]     = useState('')
  const [error, setError]     = useState(false)
  const [shake, setShake]     = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    const ok = sessionStorage.getItem(SESSION_KEY) === '1'
    setAuthed(ok)
    setChecked(true)
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (input === DEMO_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setAuthed(true)
    } else {
      setError(true)
      setShake(true)
      setInput('')
      setTimeout(() => setShake(false), 500)
    }
  }

  if (!checked) return null
  if (authed) return <>{children}</>

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4">
      <div className={`w-full max-w-sm ${shake ? 'animate-shake' : ''}`}>

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <XLogo size={48} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Nexus <span className="text-blue-400">AI</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">Acceso privado a la demo</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} className="bg-[#111827] border border-white/[0.07] rounded-2xl p-8 flex flex-col gap-5 shadow-2xl">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500 font-medium tracking-wide uppercase">
              Contraseña de acceso
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(false) }}
                placeholder="••••••••••••••"
                autoFocus
                className={`w-full bg-[#0d1420] border rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-gray-700 focus:outline-none transition ${
                  error
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-white/[0.08] focus:border-blue-500/50'
                }`}
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition">
                {showPwd
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400 mt-0.5">Contraseña incorrecta</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!input}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #1a48cc, #2a88ff)' }}
          >
            Acceder
          </button>
        </form>

        <p className="text-center text-[11px] text-gray-700 mt-6">
          Demo privada · Solo acceso por invitación
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.45s ease; }
      `}</style>
    </div>
  )
}

function XLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="gL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#808898" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#c0c4d8" /><stop offset="100%" stopColor="#606070" />
        </linearGradient>
        <linearGradient id="gR" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#808898" /><stop offset="35%" stopColor="#ffffff" /><stop offset="65%" stopColor="#c0c4d8" /><stop offset="100%" stopColor="#606070" />
        </linearGradient>
        <linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#90d0ff" /><stop offset="40%" stopColor="#1a70ff" /><stop offset="100%" stopColor="#0030b0" />
        </linearGradient>
      </defs>
      <polygon points="4,1 50,45 50,55 1,4"    fill="url(#gL)" />
      <polygon points="96,99 50,55 50,45 99,96" fill="url(#gL)" />
      <polygon points="96,1 55,50 45,50 99,4"   fill="url(#gR)" />
      <polygon points="4,99 45,50 55,50 1,96"   fill="url(#gR)" />
      <polygon points="50,33 67,50 50,67 33,50"  fill="url(#gg)" />
      <polygon points="50,39 61,50 50,61 39,50"  fill="#60b8ff" opacity="0.55" />
      <polygon points="50,43 57,50 50,57 43,50"  fill="white" opacity="0.30" />
    </svg>
  )
}
