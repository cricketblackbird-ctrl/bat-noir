import { NextResponse } from 'next/server'
import { hasCronAuthorization } from '@/lib/security/cron-auth'
import { processSecurityWindow } from '@/lib/security/monitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try {
    const result = await processSecurityWindow()
    return NextResponse.json({ ...result, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Security monitoring check failed.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
