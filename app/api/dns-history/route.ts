import { resolve4, resolveNs } from 'node:dns/promises'
import { desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dnsHistory, dnsMonitorSettings } from '@/lib/db/schema'
import { readJsonBody } from '@/lib/read-json-body'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hostname = 'montemader.com'
const maxHistoryRows = 500
const responseHeaders = { 'Cache-Control': 'private, no-store' }

type DnsAnswer = { type: string; value: string; ttl?: number }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders })
}

async function isAuthorized() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false as const, status: 401 }
  if (!(await claimOrReadMmAuthority(session.user.id))) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

function errorCode(result: PromiseSettledResult<unknown>) {
  if (result.status === 'fulfilled') return null
  const error = result.reason as NodeJS.ErrnoException | undefined
  return typeof error?.code === 'string' ? error.code.slice(0, 40) : 'DNS lookup failed'
}

async function captureDns() {
  const [aRecords, nameservers] = await Promise.allSettled([
    resolve4(hostname, { ttl: true }),
    resolveNs(hostname),
  ])
  const answers: DnsAnswer[] = []
  if (aRecords.status === 'fulfilled') answers.push(...aRecords.value.map(({ address, ttl }) => ({ type: 'A', value: address, ttl })))
  if (nameservers.status === 'fulfilled') answers.push(...nameservers.value.map((value) => ({ type: 'NS', value })))

  const lookupErrors = [errorCode(aRecords), errorCode(nameservers)].filter(Boolean)
  const status = answers.length === 0 ? 'error' : lookupErrors.length ? 'partial' : 'ok'
  const error = lookupErrors.length ? lookupErrors.join(', ').slice(0, 120) : null

  const record = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('dns-history:montemader.com')::bigint)`)
    const [setting] = await tx.select({ enabled: dnsMonitorSettings.enabled })
      .from(dnsMonitorSettings)
      .where(eq(dnsMonitorSettings.hostname, hostname))
      .limit(1)
    if (!setting?.enabled) return null

    const [latest] = await tx.select({ observedAt: dnsHistory.observedAt })
      .from(dnsHistory)
      .where(eq(dnsHistory.hostname, hostname))
      .orderBy(desc(dnsHistory.observedAt))
      .limit(1)
    if (latest && Date.now() - latest.observedAt.getTime() < 60_000) return null

    const [created] = await tx.insert(dnsHistory).values({
      hostname,
      source: 'system-resolver',
      status,
      answers,
      error,
    }).returning({ id: dnsHistory.id, observedAt: dnsHistory.observedAt })

    await tx.execute(sql`
      DELETE FROM public.dns_history
      WHERE id IN (
        SELECT id FROM public.dns_history
        WHERE hostname = ${hostname}
        ORDER BY observed_at DESC
        OFFSET ${maxHistoryRows}
      )
    `)
    return created
  })

  return { captured: Boolean(record), observedAt: record?.observedAt ?? null, status }
}

export async function GET() {
  const authorization = await isAuthorized()
  if (!authorization.ok) return json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, authorization.status)

  const [setting, history] = await Promise.all([
    db.select({ enabled: dnsMonitorSettings.enabled, updatedAt: dnsMonitorSettings.updatedAt })
      .from(dnsMonitorSettings)
      .where(eq(dnsMonitorSettings.hostname, hostname))
      .limit(1),
    db.select({ id: dnsHistory.id, hostname: dnsHistory.hostname, observedAt: dnsHistory.observedAt, source: dnsHistory.source, status: dnsHistory.status, answers: dnsHistory.answers, error: dnsHistory.error })
      .from(dnsHistory)
      .where(eq(dnsHistory.hostname, hostname))
      .orderBy(desc(dnsHistory.observedAt))
      .limit(30),
  ])

  return json({
    hostname,
    enabled: setting[0]?.enabled ?? false,
    updatedAt: setting[0]?.updatedAt ?? null,
    history: history.map(({ answers, ...item }) => ({
      ...item,
      redactedAddressCount: answers.filter((answer) => answer.type === 'A').length,
      answers: answers.filter((answer) => answer.type !== 'A'),
    })),
  })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'Invalid request origin' }, 403)

  const authorization = await isAuthorized()
  if (!authorization.ok) return json({ error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' }, authorization.status)

  const parsed = await readJsonBody(request, 1024)
  if (!parsed.ok) return json({ error: 'Invalid JSON' }, parsed.status)
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return json({ error: 'Invalid request' }, 400)

  const body = parsed.value as Record<string, unknown>
  if (body.action === 'toggle' && typeof body.enabled === 'boolean') {
    const now = new Date()
    const [setting] = await db.insert(dnsMonitorSettings).values({ hostname, enabled: body.enabled, updatedAt: now })
      .onConflictDoUpdate({ target: dnsMonitorSettings.hostname, set: { enabled: body.enabled, updatedAt: now } })
      .returning({ enabled: dnsMonitorSettings.enabled, updatedAt: dnsMonitorSettings.updatedAt })
    return json({ enabled: setting.enabled, updatedAt: setting.updatedAt })
  }

  if (body.action === 'capture') {
    const [setting] = await db.select({ enabled: dnsMonitorSettings.enabled })
      .from(dnsMonitorSettings)
      .where(eq(dnsMonitorSettings.hostname, hostname))
      .limit(1)
    if (!setting?.enabled) return json({ error: 'DNS history capture is turned off.' }, 409)
    return json(await captureDns())
  }

  return json({ error: 'Unsupported action' }, 400)
}
