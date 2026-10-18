import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const protectedHealthUrl = 'https://bat-noir-yr0cq6581-cricketblackbird-4588.vercel.app/api/security/health'
const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

function getSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null

  const sessionCookie = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => /^(?:(?:__Secure-|__Host-))?better-auth\.session_token=/.test(cookie))

  return sessionCookie ?? null
}

export async function GET() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
  }

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!bypassSecret) {
    return NextResponse.json({ error: 'Preview deployment probe is not configured.' }, { status: 503, headers: noStoreHeaders })
  }

  const sessionCookie = getSessionCookie(requestHeaders.get('cookie'))
  if (!sessionCookie) {
    return NextResponse.json({ error: 'The authenticated session cookie is unavailable for the protected probe.' }, { status: 401, headers: noStoreHeaders })
  }

  try {
    const response = await fetch(protectedHealthUrl, {
      method: 'GET',
      headers: {
        'x-vercel-protection-bypass': bypassSecret,
        'user-agent': 'BatNoir-Server-Probe/1.0',
        cookie: sessionCookie,
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        status: response.status,
        target: new URL(protectedHealthUrl).hostname,
        error: response.status === 401
          ? 'Vercel protection was reached, but the preview app did not accept the forwarded session.'
          : 'The protected preview health endpoint did not return a successful response.',
      }, { headers: noStoreHeaders })
    }

    const snapshot = await response.json().catch(() => null) as {
      domain?: string
      capturedAt?: string
      site?: { ok?: boolean; statusCode?: number | null; latencyMs?: number | null }
      cloudflare?: { available?: boolean; reason?: string }
    } | null

    if (!snapshot || typeof snapshot !== 'object') {
      return NextResponse.json({
        success: false,
        status: response.status,
        target: new URL(protectedHealthUrl).hostname,
        error: 'The protected preview health endpoint returned an invalid response.',
      }, { headers: noStoreHeaders })
    }

    return NextResponse.json({
      success: true,
      status: response.status,
      target: new URL(protectedHealthUrl).hostname,
      data: {
        domain: snapshot.domain,
        capturedAt: snapshot.capturedAt,
        site: snapshot.site ? {
          ok: snapshot.site.ok === true,
          statusCode: snapshot.site.statusCode ?? null,
          latencyMs: snapshot.site.latencyMs ?? null,
        } : null,
        cloudflare: snapshot.cloudflare ? {
          available: snapshot.cloudflare.available === true,
          reason: snapshot.cloudflare.reason,
        } : null,
      },
    }, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({
      success: false,
      status: null,
      target: new URL(protectedHealthUrl).hostname,
      error: 'The protected preview health endpoint could not be reached from the server.',
    }, { headers: noStoreHeaders })
  }
}
