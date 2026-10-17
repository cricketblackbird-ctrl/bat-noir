import { and, asc, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authorizeFighter, fighterStorageId, normalizeFighterId } from '@/lib/bot-auth'
import { getActiveAttack } from '@/lib/active-attack'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonEmergencyStop } from '@/lib/db/schema'
import { readJsonBody } from '@/lib/read-json-body'
import { SITE_SCOPE } from '@/lib/site-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ fighterId: string }> }

const inboxHeaders = { 'Cache-Control': 'private, no-store' }
const listeningContract = {
  listeningRequired: true,
  nextPollRequired: true,
  nextPollAfterMs: 5000,
  stopBlocksExecutionOnly: true,
  contract: 'PASS only when this authenticated bot continues polling the MM inbox, including while stopped. Stop blocks execution only.',
}
const telemetryContract = {
  endpoint: '/api/telemetry',
  siteScopeRequired: SITE_SCOPE,
  scopeValidation: 'Exact scope required; out-of-scope telemetry is rejected.',
  dataSource: 'Authenticated fighter reports only; not direct website request capture.',
  heartbeatEventType: 'listener_heartbeat',
  heartbeatRequiredEveryMs: 5000,
  passThresholdMs: 15000,
  allowedEventTypes: ['health_report', 'hit', 'recall', 'reappear', 'listener_heartbeat'],
  reportOnlyObservedFacts: true,
  neverSendSecretsOrVisitorPersonalData: true,
  labelInferencesAsHeuristic: true,
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

  const storageId = fighterStorageId(fighterId)
  const activeAttack = await getActiveAttack()
  return db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [stops] = await tx.select().from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true)).for('update').limit(1)
    if (!stops) return inboxJson({ error: 'Stop state unavailable' }, 503)

    if (isStopped(fighterId, stops)) {
      return inboxJson({ fighterId, siteScope: SITE_SCOPE, stopped: true, stopAll: stops.stopAll, commands: [], securityPacket: activeAttack, ...listeningContract, telemetryContract })
    }

    const [command] = await tx.select().from(dragonCommandQueue)
      .where(and(eq(dragonCommandQueue.fighterId, storageId), eq(dragonCommandQueue.status, 'queued'), gt(dragonCommandQueue.createdAt, stops.updatedAt)))
      .orderBy(asc(dragonCommandQueue.createdAt)).limit(1).for('update', { skipLocked: true })
    if (!command) return inboxJson({ fighterId, siteScope: SITE_SCOPE, stopped: false, commands: [], securityPacket: activeAttack, ...listeningContract, telemetryContract })

    const [acknowledged] = await tx.update(dragonCommandQueue)
      .set({ status: 'acknowledged', consumedAt: new Date() })
      .where(and(eq(dragonCommandQueue.id, command.id), eq(dragonCommandQueue.status, 'queued')))
      .returning()

    return inboxJson({
      fighterId,
      stopped: false,
      siteScope: SITE_SCOPE,
      command: acknowledged ? {
        id: String(acknowledged.id),
        strategy: acknowledged.strategy,
        formation: acknowledged.formation,
        threatType: acknowledged.threatType,
        siteScope: SITE_SCOPE,
        issuedBy: acknowledged.issuedBy,
        createdAt: acknowledged.createdAt,
      } : null,
      commands: [],
      securityPacket: activeAttack,
      ...listeningContract,
      telemetryContract,
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
    .where(and(eq(dragonCommandQueue.id, commandId), eq(dragonCommandQueue.fighterId, fighterStorageId(fighterId)), eq(dragonCommandQueue.status, 'acknowledged')))
    .returning({ id: dragonCommandQueue.id })
  if (!updated) return inboxJson({ error: 'Command not found or already completed' }, 404)
  return inboxJson({ completed: String(updated.id), ...listeningContract })
}
