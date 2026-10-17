import { desc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { magicDragonInsights } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const insights = await db.select({ date: magicDragonInsights.insightDate, country: magicDragonInsights.countryName, countryCode: magicDragonInsights.countryCode, visitors: magicDragonInsights.visitorCount, source: magicDragonInsights.source, capturedAt: magicDragonInsights.capturedAt })
    .from(magicDragonInsights)
    .orderBy(desc(magicDragonInsights.insightDate))
    .limit(12)

  return NextResponse.json({
    available: insights.length > 0,
    source: insights[0]?.source ?? null,
    insights,
    privacy: 'Only aggregate country/day counts belong in this feed; no IP addresses, visitor identities, or per-visitor histories are collected here.',
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
