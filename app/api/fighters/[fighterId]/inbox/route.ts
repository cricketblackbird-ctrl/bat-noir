import { and, asc, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authorizeFighter, normalizeFighterId } from '@/lib/bot-auth'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonEmergencyStop } from '@/lib/db/schema'
import { readJsonBody } from '@/lib/read-json-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ fighterId: string }> }

const inboxHeaders = { 'Cache-Control': 'private, no-store' }
const listeningContract = {
  listeningRequired: true,
  nextPollRequired: true,
  nextPollAfterMs: 5000,
  stopBlocksExecutionOnly: true,
  contract: 'Keep polling the authenticated MM inbox while stopped; stop only blocks new execution.',
}

function isStopped(fighterId: string, stops: typeof dragonEmergencyStop.$inferSelect) {
  return stops.stopAll ||
    (fighterId === 'ruach' && stops.stopRuach) ||
    (fighterId === 'xena' && stops.stopXena) ||
    (fighterId === 'superbot' && stops.stopSuperbot)
}

function inboxJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: inboxHeaders })
}

export async function GET(request: Request, { params }: Context) {
  const { fighterId: rawId } = await params
  const fighterId = normalizeFighterId(rawId)
  if (!fighterId) return inboxJson({ error: 'Unknown fighter' }, 404)
  if (authorizeFighter(request, rawId) !== fighterId) return inboxJson({ error: 'Unauthorized' }, 401)

  return db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [stops] = await tx.select().from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true)).for('update').limit(1)
    if (!stops) return inboxJson({ error: 'Stop state unavailable' }, 503)

    if (isStopped(fighterId, stops)) {
      return inboxJson({ fighterId, stopped: true, stopAll: stops.stopAll, commands: [], ...listeningContract })
    }

    const [command] = await tx.select().from(dragonCommandQueue)
      .where(and(eq(dragonCommandQueue.fighterId, fighterId), eq(dragonCommandQueue.status, 'queued'), gt(dragonCommandQueue.createdAt, stops.updatedAt)))
      .orderBy(asc(dragonCommandQueue.createdAt)).limit(1).for('update', { skipLocked: true })
    if (!command) return inboxJson({ fighterId, stopped: false, commands: [], ...listeningContract })

    const [acknowledged] = await tx.update(dragonCommandQueue)
      .set({ status: 'acknowledged', consumedAt: new Date() })
      .where(and(eq(dragonCommandQueue.id, command.id), eq(dragonCommandQueue.status, 'queued')))
      .returning()

    return inboxJson({
      fighterId,
      stopped: false,
      siteScope: 'montemader.com',
      command: acknowledged ? {
        id: String(acknowledged.id),
        strategy: acknowledged.strategy,
        formation: acknowledged.formation,
        threatType: acknowledged.threatType,
        siteScope: 'montemader.com',
        issuedBy: acknowledged.issuedBy,
        createdAt: acknowledged.createdAt,
      } : null,
      commands: [],
      ...listeningContract,
      telemetryContract: {
        endpoint: '/api/telemetry',
        allowedEventTypes: ['health_report', 'hit', 'recall', 'reappear'],
        reportOnlyObservedFacts: true,
        neverSendSecretsOrVisitorPersonalData: true,
        labelInferencesAsHeuristic: true,
      },
    })
  })
}

export async function POST(request: Request, { params }: Context) {
  const { fighterId: rawId } = await params
  const fighterId = normalizeFighterId(rawId)
  if (!fighterId) return inboxJson({ error: 'Unknown fighter' }, 404)
  if (authorizeFighter(request, rawId) !== fighterId) return inboxJson({ error: 'Unauthorized' }, 401)

  const parsed = await readJsonBody(request, 4096)
  if (!parsed.ok) return inboxJson({ error: parsed.status === 413 ? 'Payload too large' : 'Invalid JSON' }, parsed.status)
  const payload = parsed.value
  if (!payload || typeof payload !== 'object' || !('commandId' in payload) || typeof payload.commandId !== 'string' || !/^\d{1,18}$/.test(payload.commandId)) {
    return inboxJson({ error: 'A numeric commandId is required' }, 400)
  }

  const commandId = Number(payload.commandId)
  if (!Number.isSafeInteger(commandId) || commandId <= 0) return inboxJson({ error: 'A safe numeric commandId is required' }, 400)

  const [updated] = await db.update(dragonCommandQueue)
    .set({ status: 'complete', consumedAt: new Date() })
    .where(and(eq(dragonCommandQueue.id, commandId), eq(dragonCommandQueue.fighterId, fighterId), eq(dragonCommandQueue.status, 'acknowledged')))
    .returning({ id: dragonCommandQueue.id })
  if (!updated) return inboxJson({ error: 'Command not found or already completed' }, 404)
  return inboxJson({ completed: String(updated.id), ...listeningContract })
}
