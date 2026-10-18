import { randomInt } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'
import { authorizeFighter, fighterStorageId, normalizeFighterId } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { dragonTelemetryRecords } from '@/lib/db/schema'
import { readJsonBody } from '@/lib/read-json-body'
import { SITE_SCOPE } from '@/lib/site-scope'
import { verifyIncomingOidcToken } from '@/lib/verify-oidc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const jsonHeaders = { 'Cache-Control': 'private, no-store' }
const int32Max = 2_147_483_647
const validTypes = ['health_report', 'hit', 'recall', 'reappear', 'listener_heartbeat', 'combat_strike', 'strike_completed', 'strike_failed']

function telemetryJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: jsonHeaders })
}

function recordId() {
  return Math.trunc(Date.now() * 1000) + randomInt(0, 1000)
}

export async function POST(request: Request) {
  const parsed = await readJsonBody(request, 8192)
  if (!parsed.ok) return telemetryJson({ error: parsed.status === 413 ? 'Payload too large' : 'Invalid JSON' }, parsed.status)
  const body = parsed.value
  if (!body || typeof body !== 'object' || Array.isArray(body)) return telemetryJson({ error: 'Invalid telemetry' }, 400)

  const value = body as Record<string, unknown>
  const rawDragonId = typeof value.dragonId === 'string' ? value.dragonId.toLowerCase() : ''
  const fighterId = normalizeFighterId(rawDragonId)
  if (!fighterId) return telemetryJson({ error: 'Unknown fighter' }, 400)
  if (authorizeFighter(request, rawDragonId) !== fighterId) {
    try {
      await verifyIncomingOidcToken(request.headers.get('authorization'))
    } catch {
      return telemetryJson({ error: 'Unauthorized' }, 401)
    }
  }
  if (value.siteScope !== SITE_SCOPE) return telemetryJson({ error: `Telemetry must be scoped to ${SITE_SCOPE}` }, 403)

  const eventType = typeof value.eventType === 'string' ? value.eventType.trim().toLowerCase() : ''
  const health = value.healthPercent
  const hits = value.hitsTaken
  const capacity = value.hitCapacity
  const actionType = typeof value.actionType === 'string' ? value.actionType : eventType
  const threatSignature = typeof value.threatSignature === 'string' ? value.threatSignature : ''
  const status = typeof value.status === 'string' ? value.status : 'ACTIVE'
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const suppliedIp = typeof value.clientIp === 'string' ? value.clientIp.trim() : ''
  const clientIp = forwardedIp && isIP(forwardedIp) ? forwardedIp : suppliedIp && isIP(suppliedIp) ? suppliedIp : ''
  const nodeId = typeof value.nodeId === 'string'
    ? value.nodeId.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    : ''
  if (!validTypes.includes(eventType) ||
    typeof health !== 'number' || !Number.isFinite(health) || health < 0 || health > 100 ||
    typeof hits !== 'number' || !Number.isInteger(hits) || hits < 0 || hits > int32Max ||
    typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity <= 0 || capacity > int32Max ||
    (hits > capacity && eventType !== 'recall') || !nodeId || nodeId.length > 120) {
    return telemetryJson({ error: 'Telemetry fields did not pass validation' }, 400)
  }

  const skills = Array.isArray(value.skills)
    ? value.skills
      .filter((skill): skill is string => typeof skill === 'string')
      .slice(0, 12)
      .map((skill) => skill.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40))
    : []
  const allowedPayloadKeys = ['signature', 'vector', 'category']
  const payload: Record<string, string> = { siteScope: SITE_SCOPE }
  const boundedMetadata: Record<string, string> = {
    actionType: actionType.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80),
    status: status.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 40),
  }
  if (threatSignature) boundedMetadata.threatSignature = threatSignature.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
  if (clientIp) boundedMetadata.clientIp = clientIp
  Object.assign(payload, boundedMetadata)
  if (value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)) {
    for (const key of allowedPayloadKeys) {
      const field = (value.payload as Record<string, unknown>)[key]
      if (typeof field === 'string') payload[key] = field.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80)
    }
  }

  const [created] = await db.insert(dragonTelemetryRecords).values({
    id: recordId(),
    dragonId: fighterStorageId(fighterId),
    nodeId,
    eventType,
    healthPercent: health,
    hitsTaken: hits,
    hitCapacity: capacity,
    skills,
    payload,
  }).returning({ id: dragonTelemetryRecords.id, receivedAt: dragonTelemetryRecords.receivedAt })

  return telemetryJson({ accepted: true, id: String(created.id), receivedAt: created.receivedAt, siteScope: SITE_SCOPE }, 201)
}
