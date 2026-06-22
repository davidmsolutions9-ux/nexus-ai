import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import DemoGate from '@/components/DemoGate'
import PWASetup from '@/components/PWASetup'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nexus AI — Acceso unificado a modelos de IA',
  description: 'Plataforma de acceso unificado a los mejores modelos de IA con sistema de créditos transparente.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nexus AI',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#111827',
    'msapplication-tap-highlight': 'no',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#111827',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Nexus AI" />
      </head>
      <body className="min-h-full bg-gray-950 text-white">
        <PWASetup />
        <DemoGate>{children}</DemoGate>
      </body>
    </html>
  )
}
