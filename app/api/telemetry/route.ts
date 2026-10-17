import { randomInt, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dragonTelemetryRecords } from '@/lib/db/schema'

export const runtime = 'nodejs'

function authorized(request: Request, dragonId: string) {
  const tokenName = dragonId === 'ruach' ? 'DRAGON_RUACH_TOKEN' : dragonId === 'xena' || dragonId === 'zena' ? 'DRAGON_XENA_TOKEN' : 'DRAGON_SUPERBOT_TOKEN'
  const secret = process.env[tokenName]
  const candidate = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || candidate.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(secret))
}

function recordId() {
  return Number(BigInt(Date.now()) * 1000n + BigInt(randomInt(0, 1000)))
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > 8192) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid telemetry' }, { status: 400 })
  const value = body as Record<string, unknown>
  const dragonId = typeof value.dragonId === 'string' ? value.dragonId.toLowerCase() : ''
  const eventType = value.eventType
  const health = value.healthPercent
  const hits = value.hitsTaken
  const capacity = value.hitCapacity
  const nodeId = typeof value.nodeId === 'string' ? value.nodeId.trim() : ''
  const validIds = ['ruach', 'xena', 'zena', 'superbot']
  const validTypes = ['health_report', 'hit', 'recall', 'reappear']
  if (!validIds.includes(dragonId)) return NextResponse.json({ error: 'Unknown fighter' }, { status: 400 })
  if (!authorized(request, dragonId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (typeof eventType !== 'string' || !validTypes.includes(eventType) ||
    typeof health !== 'number' || !Number.isFinite(health) || health < 0 || health > 100 ||
    !Number.isInteger(hits) || (hits as number) < 0 || !Number.isInteger(capacity) || (capacity as number) <= 0 ||
    (hits as number) > (capacity as number) && eventType !== 'recall' || !nodeId || nodeId.length > 120) {
    return NextResponse.json({ error: 'Telemetry fields did not pass validation' }, { status: 400 })
  }

  const skills = Array.isArray(value.skills)
    ? value.skills.filter((skill): skill is string => typeof skill === 'string').slice(0, 12).map((skill) => skill.slice(0, 40))
    : []
  const allowedPayloadKeys = ['signature', 'vector', 'category']
  const payload: Record<string, string> = {}
  if (value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)) {
    for (const key of allowedPayloadKeys) {
      const field = (value.payload as Record<string, unknown>)[key]
      if (typeof field === 'string') payload[key] = field.replace(/[\r\n\t]/g, ' ').slice(0, 80)
    }
  }

  const [created] = await db.insert(dragonTelemetryRecords).values({
    id: recordId(),
    dragonId: dragonId === 'zena' ? 'xena' : dragonId,
    nodeId,
    eventType,
    healthPercent: health,
    hitsTaken: hits as number,
    hitCapacity: capacity as number,
    skills,
    payload,
  }).returning({ id: dragonTelemetryRecords.id, receivedAt: dragonTelemetryRecords.receivedAt })

  return NextResponse.json({ accepted: true, id: String(created.id), receivedAt: created.receivedAt }, { status: 201 })
}
