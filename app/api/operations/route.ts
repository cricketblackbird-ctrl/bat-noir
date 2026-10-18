import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getFighterCredentialStatus, type FighterId } from '@/lib/bot-auth'
import { getActiveAttack } from '@/lib/active-attack'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonControlState, dragonEmergencyStop, dragonRuleRevisions, dragonTelemetryRecords } from '@/lib/db/schema'
import { HEARTBEAT_CONFIG } from '@/lib/heartbeat-config'
import { SITE_SCOPE } from '@/lib/site-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fighterNames: Record<string, string> = { ruach: 'Ruach', xena: 'Xena', zena: 'Xena', superbot: 'SuperBot' }
const fighterRoles: Record<FighterId, string> = {
  ruach: 'Scraper signal review',
  xena: 'Traffic surge response',
  superbot: 'Credential signal review',
}
const fighters: FighterId[] = ['ruach', 'xena', 'superbot']
const listenerFreshnessMs = HEARTBEAT_CONFIG.maxHeartbeatAgeSec * 1000

function decodeRuleText(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  if (typeof value !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {}
  return value.trim() ? [value.trim()] : []
}

function canonicalFighterId(value: string) {
  return value.toLowerCase() === 'zena' ? 'xena' : value.toLowerCase()
}

function interpretSignal(event: typeof dragonTelemetryRecords.$inferSelect) {
  if (event.eventType === 'listener_heartbeat') return { label: 'Authenticated MM inbox poll', confidence: 'reported' }
  if (event.eventType === 'hit') {
    const terms = Object.values(event.payload ?? {}).join(' ').toLowerCase()
    if (/login|credential|password|auth/.test(terms)) return { label: 'Possible authentication probing', confidence: 'heuristic' }
    if (/scrap|crawl|bot/.test(terms)) return { label: 'Possible automated scraping', confidence: 'heuristic' }
    if (/rate|volume|flood|request/.test(terms)) return { label: 'Possible traffic surge', confidence: 'heuristic' }
    if (/dns|config|certificate|ssl/.test(terms)) return { label: 'Possible configuration signal', confidence: 'heuristic' }
    return { label: 'Unclassified impact reported', confidence: 'heuristic' }
  }
  return { label: event.eventType.replace(/_/g, ' '), confidence: 'reported' }
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [events, heartbeats, supportRequests, commands, combatEvents, recentTelemetry, controls, stops, telemetryTotals, activeAttack, ruleRows] = await Promise.all([
    db.selectDistinctOn([dragonTelemetryRecords.dragonId]).from(dragonTelemetryRecords)
      .where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
      ))
      .orderBy(dragonTelemetryRecords.dragonId, desc(dragonTelemetryRecords.receivedAt)),
    db.selectDistinctOn([dragonTelemetryRecords.dragonId]).from(dragonTelemetryRecords)
      .where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        eq(dragonTelemetryRecords.eventType, 'listener_heartbeat'),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
      ))
      .orderBy(dragonTelemetryRecords.dragonId, desc(dragonTelemetryRecords.receivedAt)),
    db.selectDistinctOn([dragonTelemetryRecords.dragonId]).from(dragonTelemetryRecords)
      .where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
        sql`(${dragonTelemetryRecords.payload} ->> 'supportType') IN ('update', 'repair', 'source', 'support')`,
      ))
      .orderBy(dragonTelemetryRecords.dragonId, desc(dragonTelemetryRecords.receivedAt)),
    db.select({ id: dragonCommandQueue.id, fighterId: dragonCommandQueue.fighterId, strategy: dragonCommandQueue.strategy, formation: dragonCommandQueue.formation, threatType: dragonCommandQueue.threatType, status: dragonCommandQueue.status, createdAt: dragonCommandQueue.createdAt })
      .from(dragonCommandQueue).orderBy(desc(dragonCommandQueue.createdAt)).limit(6),
    db.select({ id: dragonTelemetryRecords.id, dragonId: dragonTelemetryRecords.dragonId, eventType: dragonTelemetryRecords.eventType, healthPercent: dragonTelemetryRecords.healthPercent, hitsTaken: dragonTelemetryRecords.hitsTaken, hitCapacity: dragonTelemetryRecords.hitCapacity, payload: dragonTelemetryRecords.payload, receivedAt: dragonTelemetryRecords.receivedAt })
      .from(dragonTelemetryRecords).where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        inArray(dragonTelemetryRecords.eventType, ['combat_strike', 'strike_completed', 'strike_failed']),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
      )).orderBy(desc(dragonTelemetryRecords.receivedAt)).limit(10),
    db.select({ id: dragonTelemetryRecords.id, dragonId: dragonTelemetryRecords.dragonId, eventType: dragonTelemetryRecords.eventType, healthPercent: dragonTelemetryRecords.healthPercent, hitsTaken: dragonTelemetryRecords.hitsTaken, hitCapacity: dragonTelemetryRecords.hitCapacity, payload: dragonTelemetryRecords.payload, receivedAt: dragonTelemetryRecords.receivedAt })
      .from(dragonTelemetryRecords).where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
      )).orderBy(desc(dragonTelemetryRecords.receivedAt)).limit(8),
    db.select().from(dragonControlState),
    db.select().from(dragonEmergencyStop).where(eq(dragonEmergencyStop.singleton, true)).limit(1),
    db.select({ total: count() }).from(dragonTelemetryRecords)
      .where(and(
        gte(dragonTelemetryRecords.receivedAt, cutoff),
        sql`(${dragonTelemetryRecords.payload} ->> 'siteScope') = ${SITE_SCOPE}`,
      )),
    getActiveAttack(),
    db.select({ revision: dragonRuleRevisions.revision, rules: dragonRuleRevisions.rules, createdAt: dragonRuleRevisions.createdAt })
      .from(dragonRuleRevisions)
      .where(eq(dragonRuleRevisions.siteScope, SITE_SCOPE))
      .orderBy(desc(dragonRuleRevisions.revision))
      .limit(1),
  ])

  const observedAt = new Date()
  const [stopState] = stops
  const latestByFighter = new Map<string, typeof events[number]>()
  for (const event of events) latestByFighter.set(canonicalFighterId(event.dragonId), event)
  const heartbeatByFighter = new Map<string, typeof heartbeats[number]>()
  for (const event of heartbeats) heartbeatByFighter.set(canonicalFighterId(event.dragonId), event)
  const latestSupportRequestByFighter = new Map<string, typeof supportRequests[number]>()
  for (const event of supportRequests) latestSupportRequestByFighter.set(canonicalFighterId(event.dragonId), event)

  const fighterRows = fighters.map((id) => {
    const event = latestByFighter.get(id)
    const heartbeat = heartbeatByFighter.get(id)
    const control = controls.find((item) => canonicalFighterId(item.fighterId) === id)
    const stopped = Boolean(stopState?.stopAll ||
      (id === 'ruach' && stopState?.stopRuach) ||
      (id === 'xena' && stopState?.stopXena) ||
      (id === 'superbot' && stopState?.stopSuperbot))
    const heartbeatAgeMs = heartbeat ? observedAt.getTime() - heartbeat.receivedAt.getTime() : null
    const listenerStatus = heartbeatAgeMs === null
      ? 'WAITING'
      : heartbeatAgeMs >= 0 && heartbeatAgeMs <= listenerFreshnessMs
        ? 'PASS'
        : 'STALE'

    return {
      id,
      name: fighterNames[id],
      role: fighterRoles[id],
      mode: control?.individualMode ?? 'guard',
      status: event ? 'reporting' : 'awaiting telemetry',
      health: event?.healthPercent ?? null,
      hitsTaken: event?.hitsTaken ?? null,
      hitCapacity: event?.hitCapacity ?? null,
      lastSeen: event?.receivedAt ?? null,
      signal: event ? interpretSignal(event) : null,
      stopped,
      listenerStatus,
      lastInboxPoll: heartbeat?.receivedAt ?? null,
      heartbeatAgeMs,
      hitReportGate: {
        status: activeAttack ? 'PASS' : 'FAIL',
        reportPresent: Boolean(activeAttack),
        reportCount: activeAttack?.reportCount ?? 0,
        sourceCount: activeAttack?.sourceCount ?? 0,
        expiresAt: activeAttack?.expiresAt ?? null,
        inboxPath: `/api/fighters/${id}/inbox`,
      },
      credentialBoundary: getFighterCredentialStatus(id),
    }
  })

  const nodes = Object.fromEntries(fighterRows.map((fighter) => [fighter.id, {
    name: fighter.name,
    role: fighter.role,
    health: fighter.health,
    status: fighter.stopped ? 'Execution stopped; MM listening remains required' : fighter.status,
    listenerStatus: fighter.listenerStatus,
    lastInboxPoll: fighter.lastInboxPoll,
    credentialBoundary: fighter.credentialBoundary,
  }]))
  const systemHealth = fighterRows.every((fighter) => fighter.listenerStatus === 'PASS') ? 'PASS' : 'ATTENTION'

  return NextResponse.json({
    domain: SITE_SCOPE,
    timestamp: observedAt.toISOString(),
    rules: ruleRows[0] ? {
      ...ruleRows[0],
      rules: decodeRuleText(ruleRows[0].rules),
      createdAt: ruleRows[0].createdAt.toISOString(),
    } : null,
    reports: fighterRows.map((fighter) => {
      const event = latestByFighter.get(fighter.id)
      const requestEvent = latestSupportRequestByFighter.get(fighter.id)
      const supportType = requestEvent?.payload.supportType
      const requestType = supportType === 'update' || supportType === 'repair' || supportType === 'source' || supportType === 'support'
        ? supportType
        : null
      const rawRequest = requestEvent?.payload.supportRequest
      const request = typeof rawRequest === 'string' ? rawRequest : null
      const reportAge = event ? observedAt.getTime() - event.receivedAt.getTime() : null
      return {
        id: fighter.id,
        name: fighter.name,
        status: reportAge === null ? 'awaiting' : reportAge >= 0 && reportAge <= listenerFreshnessMs ? 'reporting' : 'stale',
        detail: event ? event.payload.status ?? event.eventType.replace(/_/g, ' ') : null,
        health: event?.healthPercent ?? null,
        reportedAt: event?.receivedAt.toISOString() ?? null,
        listenerStatus: fighter.listenerStatus,
        heartbeatAgeMs: fighter.heartbeatAgeMs,
        lastInboxPoll: fighter.lastInboxPoll?.toISOString() ?? null,
        requestType,
        request,
        requestAt: requestEvent?.receivedAt.toISOString() ?? null,
      }
    }),
    systemHealth,
    activeAttack,
    wafStatus: 'UNVERIFIED · no WAF integration is connected to this console',
    nodes,
    fighters: fighterRows,
    stops: stopState ?? { stopRuach: false, stopXena: false, stopSuperbot: false, stopAll: false, updatedAt: null },
    commands: commands.map((command) => ({ ...command, id: String(command.id), fighterName: fighterNames[command.fighterId] ?? command.fighterId })),
    combatEvents: combatEvents.map((event) => ({
      id: String(event.id),
      fighterId: canonicalFighterId(event.dragonId),
      fighterName: fighterNames[event.dragonId] ?? fighterNames[canonicalFighterId(event.dragonId)] ?? event.dragonId,
      eventType: event.eventType,
      actionType: event.payload.actionType ?? null,
      status: event.payload.status ?? null,
      threatSignature: event.payload.threatSignature ?? event.payload.signature ?? null,
      healthPercent: event.healthPercent,
      hitsTaken: event.hitsTaken,
      hitCapacity: event.hitCapacity,
      receivedAt: event.receivedAt.toISOString(),
    })),
    recentTelemetry: recentTelemetry.map((event) => {
      const fighterId = canonicalFighterId(event.dragonId)
      return {
        id: String(event.id),
        fighterId,
        fighterName: fighterNames[fighterId] ?? event.dragonId,
        eventType: event.eventType,
        actionType: event.payload.actionType ?? null,
        status: event.payload.status ?? null,
        healthPercent: event.healthPercent,
        hitsTaken: event.hitsTaken,
        hitCapacity: event.hitCapacity,
        receivedAt: event.receivedAt.toISOString(),
      }
    }),
    telemetryCount24h: telemetryTotals[0]?.total ?? 0,
    observedAt: observedAt.toISOString(),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
