import { timingSafeEqual } from 'node:crypto'
import { and, asc, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonEmergencyStop } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ fighterId: string }> }

function authorized(request: Request) {
  const secret = process.env.DRAGON_INGEST_TOKEN
  const candidate = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || candidate.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(secret))
}

function normalizeFighter(value: string) {
  const normalized = value.toLowerCase()
  if (normalized === 'xena') return 'zena'
  return ['ruach', 'zena', 'superbot'].includes(normalized) ? normalized : null
}

function isStopped(fighterId: string, stops: typeof dragonEmergencyStop.$inferSelect) {
  return stops.stopAll ||
    (fighterId === 'ruach' && stops.stopRuach) ||
    (fighterId === 'zena' && stops.stopXena) ||
    (fighterId === 'superbot' && stops.stopSuperbot)
}

export async function GET(request: Request, { params }: Context) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { fighterId: rawId } = await params
  const fighterId = normalizeFighter(rawId)
  if (!fighterId) return NextResponse.json({ error: 'Unknown fighter' }, { status: 404 })

  return db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [stops] = await tx.select().from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true)).for('update').limit(1)
    if (!stops) return NextResponse.json({ error: 'Stop state unavailable' }, { status: 503 })
    if (isStopped(fighterId, stops)) {
      return NextResponse.json({ fighterId, stopped: true, stopAll: stops.stopAll, commands: [] }, { status: 423 })
    }

    const [command] = await tx.select().from(dragonCommandQueue)
      .where(and(eq(dragonCommandQueue.fighterId, fighterId), eq(dragonCommandQueue.status, 'queued'), gt(dragonCommandQueue.createdAt, stops.updatedAt)))
      .orderBy(asc(dragonCommandQueue.createdAt)).limit(1).for('update', { skipLocked: true })
    if (!command) return NextResponse.json({ fighterId, stopped: false, commands: [] })

    const [acknowledged] = await tx.update(dragonCommandQueue)
      .set({ status: 'acknowledged', consumedAt: new Date() })
      .where(and(eq(dragonCommandQueue.id, command.id), eq(dragonCommandQueue.status, 'queued')))
      .returning()

    return NextResponse.json({ fighterId, stopped: false, command: acknowledged ? { id: String(acknowledged.id), strategy: acknowledged.strategy, formation: acknowledged.formation, issuedBy: acknowledged.issuedBy, createdAt: acknowledged.createdAt } : null, commands: [] })
  })
}

export async function POST(request: Request, { params }: Context) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { fighterId: rawId } = await params
  const fighterId = normalizeFighter(rawId)
  if (!fighterId) return NextResponse.json({ error: 'Unknown fighter' }, { status: 404 })
  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!payload || typeof payload !== 'object' || !('commandId' in payload) || typeof payload.commandId !== 'string' || !/^\d{1,18}$/.test(payload.commandId)) {
    return NextResponse.json({ error: 'A numeric commandId is required' }, { status: 400 })
  }
  const [updated] = await db.update(dragonCommandQueue)
    .set({ status: 'complete', consumedAt: new Date() })
    .where(and(eq(dragonCommandQueue.id, Number(payload.commandId)), eq(dragonCommandQueue.fighterId, fighterId), eq(dragonCommandQueue.status, 'acknowledged')))
    .returning({ id: dragonCommandQueue.id })
  if (!updated) return NextResponse.json({ error: 'Command not found or already completed' }, { status: 404 })
  return NextResponse.json({ completed: String(updated.id) })
}
