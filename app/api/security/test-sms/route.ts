import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isMmUser } from '@/lib/operator'
import { hasCronAuthorization } from '@/lib/security/cron-auth'
import { sendEmergencySms, SECURITY_TEST_MESSAGE } from '@/lib/security/sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cronAuthorized = hasCronAuthorization(request)
  if (!cronAuthorized) {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
    if (!await isMmUser(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
  }

  try {
    const result = await sendEmergencySms(SECURITY_TEST_MESSAGE)
    return NextResponse.json({ sent: true, message: SECURITY_TEST_MESSAGE, providerId: result.sid }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'SMS delivery failed. Check the Twilio connection and sender configuration.' }, { status: 502, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
