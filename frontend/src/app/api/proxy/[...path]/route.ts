import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'https://postgres-production-bd842.up.railway.app/api/v1'

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const target = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`

  const isVoice = path.includes('voice')

  const headers: Record<string, string> = {}
  const auth = req.headers.get('authorization')
  if (auth) headers['authorization'] = auth
  if (!isVoice) headers['Content-Type'] = 'application/json'

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer()

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    })

    if (isVoice && res.ok) {
      const audio = await res.arrayBuffer()
      return new NextResponse(audio, {
        status: res.status,
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    }

    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: { message: String(err) } }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
