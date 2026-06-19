import Link from 'next/link'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#030b18] text-white overflow-x-hidden flex flex-col">

      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-3">
          <XLogo size={30} />
          <span className="text-sm font-light tracking-[0.25em] text-white/70 uppercase">Nexus AI</span>
        </div>
        <div className="flex gap-3">
          <Link href="/login" className="px-5 py-2 text-sm text-gray-400 hover:text-white transition tracking-wide">
            Entrar
          </Link>
          <Link href="/register" className="px-5 py-2 text-sm border border-blue-500/40 hover:border-blue-400 hover:bg-blue-500/10 rounded-lg transition tracking-wide text-blue-300">
            Empezar gratis
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex-1 flex items-center min-h-screen overflow-hidden">

        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/4 top-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute right-1/4 top-1/4 w-80 h-80 bg-blue-500/8 rounded-full blur-3xl" />
        </div>

        {/* Left content */}
        <div className="relative z-10 flex flex-col justify-center px-12 md:px-20 pt-24 pb-10 w-full md:w-1/2">

          {/* Big X logo */}
          <div className="mb-8">
            <XLogo size={80} />
          </div>

          {/* Nexus */}
          <h1 className="text-[5rem] md:text-[7rem] font-thin tracking-[0.04em] leading-[0.9] text-white mb-1"
            style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.02em' }}>
            Nexus
          </h1>

          {/* AI */}
          <div className="text-[3.5rem] md:text-[5rem] font-bold tracking-[0.3em] leading-none mb-6"
            style={{ color: '#4da6ff', textShadow: '0 0 40px rgba(77,166,255,0.5)' }}>
            AI
          </div>

          {/* Tagline */}
          <p className="text-base md:text-lg tracking-[0.15em] text-gray-300/80 font-light mb-10 uppercase">
            The Next Generation AI
          </p>

          {/* CTAs */}
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/register"
              className="px-8 py-3.5 rounded-xl font-medium text-sm tracking-wide transition text-white"
              style={{ background: 'linear-gradient(135deg, #1a56db, #4da6ff)', boxShadow: '0 0 30px rgba(77,166,255,0.3)' }}
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-sm tracking-wide transition"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>

        {/* Right — Robot */}
        <div className="absolute right-0 top-0 h-full w-1/2 md:w-[48%] pointer-events-none hidden md:block">
          {/* Glow behind robot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[500px] h-[500px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(77,166,255,0.15) 0%, transparent 70%)' }} />
          </div>
          <Image
            src="/nexus1.png"
            alt="Nexus AI"
            fill
            className="object-cover object-center"
            priority
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, black 25%, black 80%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 10%, black 85%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 25%, black 80%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 10%, black 85%, transparent 100%)',
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }}
          />
        </div>

        {/* Bottom — Earth */}
        <div className="absolute bottom-0 left-0 right-0 h-56 pointer-events-none">
          <Image
            src="/nexus2.png"
            alt="Earth"
            fill
            className="object-cover object-bottom"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 75%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 75%, transparent 100%)',
              opacity: 0.7,
            }}
          />
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 px-10 py-20 border-t border-white/5 max-w-6xl mx-auto w-full">
        {[
          { icon: '⚡', title: 'Slider inteligente', desc: 'Modo Económico, Auto o Pro. El orquestador elige el modelo óptimo en tiempo real.' },
          { icon: '💎', title: 'Créditos transparentes', desc: '75 ACUs = 100 Créditos. Sabes exactamente cuánto cuesta cada llamada.' },
          { icon: '📈', title: 'Dynamic Pricing', desc: 'Precios ajustados en tiempo real según la carga global de los proveedores.' },
        ].map((f) => (
          <div key={f.title} className="p-7 rounded-2xl border border-white/[0.06] hover:border-blue-500/20 transition group"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-2xl mb-4">{f.icon}</div>
            <h3 className="font-semibold text-base mb-2 tracking-wide">{f.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Plans */}
      <section className="px-10 py-16 border-t border-white/5">
        <h2 className="text-center text-2xl font-light tracking-[0.15em] mb-10 uppercase text-white/80">Planes</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {[
            { name: 'LITE', price: '9€', credits: '100' },
            { name: 'PLUS', price: '29€', credits: '400' },
            { name: 'PRO', price: '79€', credits: '1.200', highlight: true },
            { name: 'MAX', price: '149€', credits: '2.500' },
            { name: 'ENTERPRISE', price: '219€+', credits: '5.000' },
          ].map((p) => (
            <Link href="/register" key={p.name}
              className={`p-5 rounded-2xl border text-center transition hover:scale-[1.03] block ${
                p.highlight
                  ? 'border-blue-500/40 hover:border-blue-400/60'
                  : 'border-white/[0.06] hover:border-white/10'
              }`}
              style={p.highlight ? { background: 'rgba(26,86,219,0.15)', boxShadow: '0 0 20px rgba(77,166,255,0.1)' } : { background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="text-[10px] tracking-[0.2em] text-gray-500 mb-2 uppercase">{p.name}</div>
              <div className="text-3xl font-bold mb-1 text-white">{p.price}</div>
              <div className="text-[10px] text-gray-600 mb-2">/mes</div>
              <div className="text-xs text-blue-400/80">{p.credits} cr/día</div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-gray-700 py-8 border-t border-white/5 tracking-widest uppercase">
        © 2026 Nexus AI
      </footer>
    </main>
  )
}

function XLogo({ size = 40 }: { size?: number }) {
  const s = size
  const stroke = size * 0.09
  const gem = size * 0.12

  return (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="xGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8eaf0" />
          <stop offset="40%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#9aa0b0" />
        </linearGradient>
        <linearGradient id="xGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e8eaf0" />
          <stop offset="40%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#9aa0b0" />
        </linearGradient>
        <linearGradient id="gemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60b4ff" />
          <stop offset="50%" stopColor="#1a78ff" />
          <stop offset="100%" stopColor="#0040cc" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Left-to-right diagonal */}
      <line x1="10" y1="8" x2="90" y2="92" stroke="url(#xGrad1)" strokeWidth="14" strokeLinecap="round" />
      {/* Right-to-left diagonal */}
      <line x1="90" y1="8" x2="10" y2="92" stroke="url(#xGrad2)" strokeWidth="14" strokeLinecap="round" />
      {/* Center gem diamond */}
      <polygon
        points="50,38 58,50 50,62 42,50"
        fill="url(#gemGrad)"
        filter="url(#glow)"
      />
      <polygon
        points="50,40 56,50 50,60 44,50"
        fill="#60b4ff"
        opacity="0.6"
      />
    </svg>
  )
}
