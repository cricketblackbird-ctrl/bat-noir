import { and, desc, eq, gte } from 'drizzle-orm'
import { fighterStorageId } from '@/lib/bot-auth'
import type { FighterId } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { dragonTelemetryRecords } from '@/lib/db/schema'

export const ACTIVE_ATTACK_WINDOW_MS = 60_000

const fighterNames: Record<FighterId, string> = {
  ruach: 'Ruach',
  xena: 'Xena',
  superbot: 'SuperBot',
}

type AttackRow = Pick<typeof dragonTelemetryRecords.$inferSelect,
  'dragonId' | 'nodeId' | 'eventType' | 'healthPercent' | 'hitsTaken' | 'hitCapacity' | 'payload' | 'receivedAt'>

function correlationKey(payload: Record<string, string>) {
  const category = payload.category?.trim().toLowerCase()
  const vector = payload.vector?.trim().toLowerCase()
  return category || vector || null
}

export async function getActiveAttack(now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVE_ATTACK_WINDOW_MS)
  const rows = await db.select({
    dragonId: dragonTelemetryRecords.dragonId,
    nodeId: dragonTelemetryRecords.nodeId,
    eventType: dragonTelemetryRecords.eventType,
    healthPercent: dragonTelemetryRecords.healthPercent,
    hitsTaken: dragonTelemetryRecords.hitsTaken,
    hitCapacity: dragonTelemetryRecords.hitCapacity,
    payload: dragonTelemetryRecords.payload,
    receivedAt: dragonTelemetryRecords.receivedAt,
  }).from(dragonTelemetryRecords)
    .where(and(
      eq(dragonTelemetryRecords.eventType, 'hit'),
      gte(dragonTelemetryRecords.receivedAt, cutoff),
    ))
    .orderBy(desc(dragonTelemetryRecords.receivedAt))
    .limit(20)

  const reports = (rows as AttackRow[]).filter((row) => row.receivedAt.getTime() <= now.getTime())
  const latest = reports[0]
  if (!latest) return null

  const latestKey = correlationKey(latest.payload ?? {})
  const relatedReports = latestKey
    ? reports.filter((report) => correlationKey(report.payload ?? {}) === latestKey)
    : [latest]
  const sourceIds = [...new Set(relatedReports.map((report) => report.dragonId.toLowerCase() === 'zena' ? 'xena' : report.dragonId.toLowerCase()))]
  const expiresAt = new Date(latest.receivedAt.getTime() + ACTIVE_ATTACK_WINDOW_MS)

  return {
    state: 'active' as const,
    evidence: 'authenticated_bot_hit_report' as const,
    confidence: 'reported_not_independently_confirmed' as const,
    detectedAt: latest.receivedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    windowMs: ACTIVE_ATTACK_WINDOW_MS,
    correlated: sourceIds.length > 1,
    reportCount: relatedReports.length,
    sourceCount: sourceIds.length,
    sources: sourceIds.map((id) => ({
      id,
      name: fighterNames[id as FighterId] ?? id,
    })),
    reports: relatedReports.map((report) => {
      const fighterId = report.dragonId.toLowerCase() === 'zena' ? 'xena' : report.dragonId.toLowerCase()
      const payload = report.payload ?? {}
      return {
        fighterId,
        fighterName: fighterNames[fighterId as FighterId] ?? fighterId,
        nodeId: report.nodeId,
        receivedAt: report.receivedAt.toISOString(),
        healthPercent: report.healthPercent,
        hitsTaken: report.hitsTaken,
        hitCapacity: report.hitCapacity,
        category: payload.category ?? null,
        vector: payload.vector ?? null,
        signature: payload.signature ?? null,
      }
    }),
  }
}
