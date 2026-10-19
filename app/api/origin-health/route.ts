import { request } from 'node:https'
import { isIP } from 'node:net'
import { performance } from 'node:perf_hooks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SITE_SCOPE } from '@/lib/site-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const timeoutMs = 8_000

function isPublicIPv4(address: string) {
  if (isIP(address) !== 4) return false
  const [first, second] = address.split('.').map(Number)

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
  )
}

function getOriginTarget(value: string) {
  if (isIP(value) === 4) {
    if (!isPublicIPv4(value)) return null
    return { hostname: value, servername: SITE_SCOPE, hostHeader: SITE_SCOPE }
  }

  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !url.hostname ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.local')
    ) return null

    if (isIP(url.hostname) === 4 && !isPublicIPv4(url.hostname)) return null
    if (isIP(url.hostname) === 6) return null

    return {
      hostname: url.hostname,
      servername: isIP(url.hostname) ? SITE_SCOPE : url.hostname,
      hostHeader: isIP(url.hostname) ? SITE_SCOPE : url.hostname,
    }
  } catch {
    return null
  }
}

function probeOrigin(target: NonNullable<ReturnType<typeof getOriginTarget>>) {
  return new Promise<{ statusCode: number; latencyMs: number }>((resolve, reject) => {
    const startedAt = performance.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const req = request({
      hostname: target.hostname,
      port: 443,
      method: 'GET',
      path: '/api/health',
      servername: target.servername,
      headers: {
        Host: target.hostHeader,
        Accept: 'text/plain, application/json;q=0.9, */*;q=0.8',
      },
      signal: controller.signal,
    }, (response) => {
      response.resume()
      response.once('end', () => {
        clearTimeout(timeout)
        resolve({
          statusCode: response.statusCode ?? 502,
          latencyMs: Math.round(performance.now() - startedAt),
        })
      })
      response.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    req.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    req.end()
  })
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders })
  }

  const configuredOrigin = process.env.ORIGIN_IP?.trim()
  const originTarget = configuredOrigin ? getOriginTarget(configuredOrigin) : null
  if (!originTarget) {
    return NextResponse.json(
      { error: 'Set ORIGIN_IP in Vercel to a public IPv4 address or an HTTPS tunnel hostname, without a path.' },
      { status: 503, headers: responseHeaders },
    )
  }

  try {
    const result = await probeOrigin(originTarget)
    return NextResponse.json({
      ok: result.statusCode >= 200 && result.statusCode < 300,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
    }, { headers: responseHeaders })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({
      ok: false,
      statusCode: null,
      latencyMs: null,
      error: timedOut
        ? `Origin health check timed out after ${timeoutMs / 1000} seconds.`
        : 'Vercel could not establish a valid HTTPS connection to the configured origin.',
    }, { status: 502, headers: responseHeaders })
  }
}
