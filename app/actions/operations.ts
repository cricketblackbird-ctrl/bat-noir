'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getActiveAttack } from '@/lib/active-attack'
import { db } from '@/lib/db'
import { dragonCommandQueue, dragonEmergencyStop } from '@/lib/db/schema'
import { requireMm } from '@/lib/operator'
import { SITE_SCOPE } from '@/lib/site-scope'

const strategies = ['inspect_verify', 'shield_restore', 'isolate_recover'] as const
const fighters = ['ruach', 'xena', 'superbot'] as const
const strikePresets = {
  ruach: { strategy: 'isolate_recover', threatType: 'scraper' },
  xena: { strategy: 'shield_restore', threatType: 'traffic_surge' },
  superbot: { strategy: 'inspect_verify', threatType: 'credential_probe' },
} as const

export type FighterId = (typeof fighters)[number]
const formations = [
  'ruach_only',
  'xena_only',
  'superbot_only',
  'all_three',
] as const

export type Strategy = (typeof strategies)[number]
export type Formation = (typeof formations)[number]
export type StopTarget = 'ruach' | 'xena' | 'superbot' | 'all'

const formationFighters: Record<Formation, string[]> = {
  ruach_only: ['ruach'],
  xena_only: ['zena'],
  superbot_only: ['superbot'],
  all_three: ['ruach', 'zena', 'superbot'],
}

function stopAppliesTo(fighter: string, state: typeof dragonEmergencyStop.$inferSelect) {
  return state.stopAll ||
    (fighter === 'ruach' && state.stopRuach) ||
    (fighter === 'zena' && state.stopXena) ||
    (fighter === 'superbot' && state.stopSuperbot)
}

export async function issueDefenseRunbook(input: { strategy: string; formation: string }) {
  const mm = await requireMm()
  if (!strategies.includes(input.strategy as Strategy) || !formations.includes(input.formation as Formation)) {
    throw new Error('Choose an available defensive runbook and formation.')
  }

  const strategy = input.strategy as Strategy
  const formation = input.formation as Formation
  const fighters = formationFighters[formation]
  if (formation === 'all_three' && !await getActiveAttack()) {
    throw new Error('The coordinated response is only available while a recent authenticated attack report is active.')
  }

  const rows = await db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [stops] = await tx
      .select()
      .from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true))
      .for('update')
      .limit(1)
    if (!stops || fighters.some((fighter) => stopAppliesTo(fighter, stops))) {
      throw new Error('A selected fighter is stopped. Clear its MM stop before issuing a directive.')
    }

    return tx.insert(dragonCommandQueue).values(
      fighters.map((fighterId) => ({ fighterId, strategy, formation, issuedBy: mm.id })),
    ).returning({ id: dragonCommandQueue.id, fighterId: dragonCommandQueue.fighterId })
  })

  revalidatePath('/')
  return { queued: rows.length }
}

export async function issueStrike(input: { fighterId: string }) {
  const mm = await requireMm()
  if (!fighters.includes(input.fighterId as FighterId)) throw new Error('Choose one assigned fighter.')

  const fighterId = input.fighterId as FighterId
  const activeAttack = await getActiveAttack()
  if (!activeAttack) throw new Error('Defensive directives are only available while a recent authenticated attack report is active.')

  const fighterKey = fighterId === 'xena' ? 'zena' : fighterId
  const preset = strikePresets[fighterId]

  const [queued] = await db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [stops] = await tx.select().from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true)).for('update').limit(1)
    if (!stops || stopAppliesTo(fighterKey, stops)) {
      throw new Error('This fighter is stopped. Release its MM stop before issuing a directive.')
    }

    return tx.insert(dragonCommandQueue).values({
      fighterId: fighterKey,
      strategy: preset.strategy,
      formation: `${fighterId}_solo_combo`,
      threatType: preset.threatType,
      issuedBy: mm.id,
    }).returning({ id: dragonCommandQueue.id })
  })

  revalidatePath('/')
  return { queued: String(queued.id), fighterId, siteScope: SITE_SCOPE, threatType: preset.threatType }
}

export async function setEmergencyStop(input: { target: string; stopped: boolean }) {
  const mm = await requireMm()
  const targets = ['ruach', 'xena', 'superbot', 'all'] as const
  if (!targets.includes(input.target as StopTarget) || typeof input.stopped !== 'boolean') {
    throw new Error('Invalid emergency stop control.')
  }
  const target = input.target as StopTarget

  await db.transaction(async (tx) => {
    await tx.insert(dragonEmergencyStop).values({ singleton: true }).onConflictDoNothing()
    const [current] = await tx
      .select()
      .from(dragonEmergencyStop)
      .where(eq(dragonEmergencyStop.singleton, true))
      .for('update')
      .limit(1)
    if (!current) throw new Error('Emergency stop state is unavailable.')

    const update = {
      ...(target === 'ruach' ? { stopRuach: input.stopped } : {}),
      ...(target === 'xena' ? { stopXena: input.stopped } : {}),
      ...(target === 'superbot' ? { stopSuperbot: input.stopped } : {}),
      ...(target === 'all' ? { stopAll: input.stopped } : {}),
      updatedBy: mm.id,
      updatedAt: new Date(),
    }
    await tx.update(dragonEmergencyStop)
      .set(update)
      .where(and(eq(dragonEmergencyStop.singleton, true)))
  })

  revalidatePath('/')
  return { stopped: input.stopped }
}
