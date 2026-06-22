import Link from 'next/link'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#03080f] text-white overflow-x-hidden">

      {/* ── HERO: imagen corporativa completa ── */}
      <section className="relative min-h-screen flex items-end overflow-hidden">

        {/* Imagen de fondo completa */}
        <div className="absolute inset-0">
          <Image
            src="/nexus-hero.png"
            alt="Nexus AI"
            fill
            priority
            className="object-contain object-center"
            style={{ padding: '2% 0' }}
          />
          {/* Fade inferior para que el contenido aparezca limpio */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, transparent 55%, rgba(3,8,15,0.7) 75%, rgba(3,8,15,0.95) 92%, #03080f 100%)',
            }}
          />
        </div>

        {/* Nav superpuesto */}
        <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-10 py-6">
          <div className="flex items-center gap-2 opacity-0">
            {/* oculto — la imagen ya tiene el logo */}
            <span className="text-xs">Nexus AI</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="px-5 py-2 text-sm text-white/70 hover:text-white transition backdrop-blur-sm">
              Entrar
            </Link>
            <Link
              href="/register"
              className="px-5 py-2 text-sm border border-blue-400/40 hover:border-blue-400 hover:bg-blue-500/15 rounded-lg transition text-blue-300 backdrop-blur-sm"
            >
              Registro
            </Link>
          </div>
        </nav>

        {/* CTAs en la parte inferior izquierda */}
        <div className="relative z-10 w-full px-12 md:px-20 pb-20">
          <div className="flex flex-col sm:flex-row gap-3 max-w-xs">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-10 py-4 rounded-xl font-bold text-sm tracking-[0.12em] uppercase text-white transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, #1848cc 0%, #2a88ff 100%)',
                boxShadow: '0 0 30px rgba(42,136,255,0.5), 0 4px 20px rgba(24,72,204,0.6)',
              }}
            >
              Comenzar
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-4 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl font-medium text-sm text-white transition backdrop-blur-sm"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 px-10 py-20 border-t border-white/[0.04] max-w-6xl mx-auto w-full">
        {[
          { icon: '⚡', title: 'Slider inteligente', desc: 'Modo Económico, Auto o Pro. El orquestador elige el modelo óptimo en tiempo real.' },
          { icon: '💎', title: 'Créditos transparentes', desc: '75 ACUs = 100 Créditos. Sabes exactamente cuánto cuesta cada llamada.' },
          { icon: '📈', title: 'Dynamic Pricing', desc: 'Precios ajustados en tiempo real según la carga global de los proveedores.' },
        ].map((f) => (
          <div key={f.title} className="p-7 rounded-2xl border border-white/[0.05] hover:border-blue-500/15 transition"
            style={{ background: 'rgba(255,255,255,0.012)' }}>
            <div className="text-2xl mb-4">{f.icon}</div>
            <h3 className="font-semibold text-sm mb-2 tracking-wide">{f.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Plans */}
      <section className="px-10 py-16 border-t border-white/[0.04]">
        <h2 className="text-center text-lg font-light tracking-[0.25em] mb-10 uppercase text-white/40">Planes</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto">
          {[
            { name: 'LITE',       price: '9€',    credits: '100'   },
            { name: 'PLUS',       price: '29€',   credits: '400'   },
            { name: 'PRO',        price: '79€',   credits: '1.333', highlight: true },
            { name: 'MAX',        price: '149€',  credits: '2.666' },
            { name: 'ENTERPRISE', price: '219€+', credits: '4.000' },
          ].map((p) => (
            <Link href="/register" key={p.name}
              className={`p-5 rounded-2xl border text-center transition hover:scale-[1.02] block ${
                p.highlight ? 'border-blue-500/25 hover:border-blue-400/45' : 'border-white/[0.05] hover:border-white/10'
              }`}
              style={p.highlight
                ? { background: 'rgba(26,72,204,0.1)', boxShadow: '0 0 25px rgba(42,136,255,0.07)' }
                : { background: 'rgba(255,255,255,0.012)' }}
            >
              <div className="text-[10px] tracking-[0.2em] text-gray-600 mb-2 uppercase">{p.name}</div>
              <div className="text-2xl font-bold mb-1 text-white">{p.price}</div>
              <div className="text-[10px] text-gray-700 mb-2">/mes</div>
              <div className="text-xs text-blue-400/60">{p.credits} cr/día</div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-gray-800 py-8 border-t border-white/[0.04] tracking-widest uppercase">
        © 2026 Nexus AI
      </footer>
    </main>
  )
}
