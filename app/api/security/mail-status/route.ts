import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { MAIL_RECIPIENT, isOwnerEmailConfigured } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  }

  return NextResponse.json({
    configured: isOwnerEmailConfigured(),
    recipient: MAIL_RECIPIENT,
    authMail: 'Password recovery',
    telemetryMail: 'New Cloudflare security incidents',
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
