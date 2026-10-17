import { count, desc, eq, gte } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonControlState, dragonEmergencyStop, dragonTelemetryRecords } from '@/lib/db/schema'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fighterNames: Record<string, string> = { ruach: 'Ruach', xena: 'Xena', zena: 'Xena', superbot: 'SuperBot' }

function interpretSignal(event: typeof dragonTelemetryRecords.$inferSelect) {
  if (event.eventType === 'hit') {
    const terms = Object.values(event.payload ?? {}).join(' ').toLowerCase()
    if (/login|credential|password|auth/.test(terms)) return { label: 'Possible authentication probing', confidence: 'heuristic' }
    if (/scrap|crawl|bot/.test(terms)) return { label: 'Possible automated scraping', confidence: 'heuristic' }
    if (/rate|volume|flood|request/.test(terms)) return { label: 'Possible traffic surge', confidence: 'heuristic' }
    if (/dns|config|certificate|ssl/.test(terms)) return { label: 'Possible configuration signal', confidence: 'heuristic' }
    return { label: 'Unclassified impact reported', confidence: 'heuristic' }
  }
  return { label: event.eventType.replaceAll('_', ' '), confidence: 'reported' }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isMm = await claimOrReadMmAuthority(session.user.id)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [events, commands, controls, stops, telemetryTotals] = await Promise.all([
    db.selectDistinctOn([dragonTelemetryRecords.dragonId]).from(dragonTelemetryRecords)
      .where(gte(dragonTelemetryRecords.receivedAt, cutoff))
      .orderBy(dragonTelemetryRecords.dragonId, desc(dragonTelemetryRecords.receivedAt)),
    db.select({ total: count() }).from(dragonTelemetryRecords)
      .where(gte(dragonTelemetryRecords.receivedAt, cutoff)),\n    db.select({ id: dragonCommandQueue.id, fighterId: dragonCommandQueue.fighterId, strategy: dragonCommandQueue.strategy, formation: dragonCommandQueue.formation, threatType: dragonCommandQueue.threatType, status: dragonCommandQueue.status, createdAt: dragonCommandQueue.createdAt })
      .from(dragonCommandQueue).orderBy(desc(dragonCommandQueue.createdAt)).limit(6),
    db.select().from(dragonControlState),
    db.select().from(dragonEmergencyStop).where(eq(dragonEmergencyStop.singleton, true)).limit(1),
  ])

  const [stopState] = stops
  const latestByFighter = new Map<string, typeof events[number]>()
  for (const event of events) {
    const key = event.dragonId.toLowerCase()
    if (!latestByFighter.has(key)) latestByFighter.set(key, event)
  }

  return NextResponse.json({
    operator: { name: session.user.name, email: session.user.email, isMm },
    fighters: ['ruach', 'xena', 'superbot'].map((id) => {
      const event = latestByFighter.get(id)
      const control = controls.find((item) => item.fighterId === id)
      return {
        id,
        name: fighterNames[id],
        mode: control?.individualMode ?? 'guard',
        status: event ? 'reporting' : 'awaiting telemetry',
        health: event?.healthPercent ?? null,
        hitsTaken: event?.hitsTaken ?? null,
        hitCapacity: event?.hitCapacity ?? null,
        lastSeen: event?.receivedAt ?? null,
        skills: event?.skills ?? [],
        signal: event ? interpretSignal(event) : null,
        stopped: Boolean(stopState?.stopAll || (id === 'ruach' && stopState?.stopRuach) || (id === 'xena' && stopState?.stopXena) || (id === 'superbot' && stopState?.stopSuperbot)),
      }
    }),
    stops: stopState ?? { stopRuach: false, stopXena: false, stopSuperbot: false, stopAll: false, updatedAt: null },
    commands: commands.map((command) => ({ ...command, id: String(command.id), fighterName: fighterNames[command.fighterId] ?? command.fighterId })),
    telemetryCount24h: telemetryTotals[0]?.total ?? 0,
    observedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
