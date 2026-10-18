import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const teamId = 'team_9tdSkVYNVhh2UrJgOwjPJj8E'
const projectId = 'prj_RKTRvnYbgbO2CqxdDpYiCEbZeBvN'
const projectName = 'master_control_suite'
const maxBillingBytes = 5_000_000
const responseHeaders = { 'Cache-Control': 'private, no-store' }

type ApiAvailability = { available: false; reason: string }
type PathViews = { path: string; views: number }
type CurrencyTotal = { currency: string; billedCost: number; effectiveCost: number; chargeCount: number }

type UsageSnapshot = {
  capturedAt: string
  project: { id: string; name: string }
  team: { id: string; slug: string }
  period: { from: string; through: string; timezone: 'UTC' }
  analytics: { available: true; paths: PathViews[]; pathViewsTotal: number; returnedPathCount: number } | ApiAvailability
  billing: { available: true; currencies: CurrencyTotal[]; chargeCount: number } | ApiAvailability
}

function unavailableForStatus(status: number) {
  if (status === 401 || status === 403) return 'Vercel rejected the configured token or its access. Use a valid token with team access to Web Analytics and billing charges.'
  if (status === 429) return 'Vercel rate-limited this request. Retry later.'
  return `Vercel returned HTTP ${status}.`
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function parseAnalyticsRows(value: unknown): PathViews[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) return []
  return (value as { data: Array<Record<string, unknown>> }).data
    .map((row) => ({
      path: typeof row.requestPath === 'string' ? row.requestPath : typeof row.request_path === 'string' ? row.request_path : '',
      views: numericValue(row.count ?? row.value ?? row.visits ?? row.pageViews ?? row.pageviews),
    }))
    .filter((row) => row.path.startsWith('/') && !row.path.startsWith('//') && Number.isFinite(row.views) && row.views >= 0)
    .sort((a, b) => b.views - a.views)
}

function parseChargeLine(line: string, totals: Map<string, CurrencyTotal>) {
  if (!line.trim()) return false
  let record: Record<string, unknown>
  try {
    record = JSON.parse(line) as Record<string, unknown>
  } catch {
    return false
  }
  const currencyValue = record.BillingCurrency ?? record.billingCurrency
  const currency = typeof currencyValue === 'string' && /^[A-Z]{3}$/.test(currencyValue) ? currencyValue : 'Unknown currency'
  const current = totals.get(currency) ?? { currency, billedCost: 0, effectiveCost: 0, chargeCount: 0 }
  current.billedCost += numericValue(record.BilledCost ?? record.billedCost)
  current.effectiveCost += numericValue(record.EffectiveCost ?? record.effectiveCost)
  current.chargeCount += 1
  totals.set(currency, current)
  return true
}

async function readChargeTotals(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return { currencies: [] as CurrencyTotal[], chargeCount: 0 }

  const decoder = new TextDecoder()
  const totals = new Map<string, CurrencyTotal>()
  let pending = ''
  let bytesRead = 0
  let chargeCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > maxBillingBytes) {
      await reader.cancel()
      throw new Error('Vercel billing response exceeded the safe processing limit.')
    }
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (parseChargeLine(line, totals)) chargeCount += 1
    }
  }

  pending += decoder.decode()
  if (parseChargeLine(pending, totals)) chargeCount += 1

  return { currencies: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)), chargeCount }
}

async function fetchAnalytics(token: string, from: string, through: string): Promise<UsageSnapshot['analytics']> {
  const url = new URL('https://api.vercel.com/v1/query/web-analytics/visits/aggregate')
  url.searchParams.set('projectId', projectId)
  url.searchParams.set('teamId', teamId)
  url.searchParams.set('by', 'requestPath')
  url.searchParams.set('since', from)
  url.searchParams.set('until', through)
  url.searchParams.set('limit', '100')

  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return { available: false, reason: unavailableForStatus(response.status) }
    const rows = parseAnalyticsRows(await response.json())
    return { available: true, paths: rows.slice(0, 20), pathViewsTotal: rows.reduce((sum, row) => sum + row.views, 0), returnedPathCount: rows.length }
  } catch {
    return { available: false, reason: 'Could not read Web Analytics from Vercel.' }
  }
}

async function fetchBilling(token: string, from: string, through: string): Promise<UsageSnapshot['billing']> {
  const url = new URL('https://api.vercel.com/v1/billing/charges')
  url.searchParams.set('teamId', teamId)
  url.searchParams.set('from', `${from}T00:00:00.000Z`)
  url.searchParams.set('to', `${through}T23:59:59.999Z`)

  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return { available: false, reason: unavailableForStatus(response.status) }
    const result = await readChargeTotals(response)
    return { available: true, ...result }
  } catch {
    return { available: false, reason: 'Could not read billing charges from Vercel.' }
  }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders })
  if (!(await claimOrReadMmAuthority(session.user.id))) {
    return NextResponse.json({ error: 'Only the authorized operator can view Vercel team usage.' }, { status: 403, headers: responseHeaders })
  }

  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const through = now.toISOString().slice(0, 10)
  const token = process.env.VERCEL_API_TOKEN?.trim()
  const [analytics, billing] = token
    ? await Promise.all([fetchAnalytics(token, from, through), fetchBilling(token, from, through)])
    : [
        { available: false as const, reason: 'VERCEL_API_TOKEN is not configured on the server.' },
        { available: false as const, reason: 'VERCEL_API_TOKEN is not configured on the server.' },
      ]

  const snapshot: UsageSnapshot = {
    capturedAt: now.toISOString(),
    project: { id: projectId, name: projectName },
    team: { id: teamId, slug: 'cricketblackbird-4588' },
    period: { from, through, timezone: 'UTC' },
    analytics,
    billing,
  }

  return NextResponse.json(snapshot, { headers: responseHeaders })
}
