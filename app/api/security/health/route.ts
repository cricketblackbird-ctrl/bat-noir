import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSiteHealthSnapshot } from '@/lib/security/monitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  try {
    return NextResponse.json(await getSiteHealthSnapshot(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Live Cloudflare security analytics are unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
