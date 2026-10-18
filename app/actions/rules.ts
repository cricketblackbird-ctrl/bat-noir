'use server'

import { desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { dragonRuleRevisions } from '@/lib/db/schema'
import { requireMm } from '@/lib/operator'
import { SITE_SCOPE } from '@/lib/site-scope'

function decodeRules(value: unknown): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value
  if (typeof value !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed
  } catch {}
  return value.trim() ? [value.trim()] : []
}

export async function appendRule(input: { rule: string }) {
  const operator = await requireMm()
  if (typeof input.rule !== 'string') throw new Error('Enter a rule before saving.')
  const rule = input.rule.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!rule || rule.length > 500) throw new Error('Rules must contain 1–500 characters.')

  const [saved] = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741925, 2)`)
    const [latest] = await tx.select({
      id: dragonRuleRevisions.id,
      revision: dragonRuleRevisions.revision,
      rules: dragonRuleRevisions.rules,
    }).from(dragonRuleRevisions)
      .where(eq(dragonRuleRevisions.siteScope, SITE_SCOPE))
      .orderBy(desc(dragonRuleRevisions.revision))
      .limit(1)

    const rules = latest ? decodeRules(latest.rules) : []
    if (rules.length >= 40) throw new Error('The rules page has reached its 40-rule limit.')
    if (rules.includes(rule)) throw new Error('That rule is already saved.')
    const [idRow] = await tx.select({ nextId: sql<number>`coalesce(max(${dragonRuleRevisions.id}), 0) + 1` }).from(dragonRuleRevisions)

    return tx.insert(dragonRuleRevisions).values({
      id: Number(idRow?.nextId ?? 1),
      siteScope: SITE_SCOPE,
      revision: (latest?.revision ?? 0) + 1,
      rules: [...rules, rule],
      createdBy: operator.id,
    }).returning({ id: dragonRuleRevisions.id, revision: dragonRuleRevisions.revision, rules: dragonRuleRevisions.rules, createdAt: dragonRuleRevisions.createdAt })
  })

  revalidatePath('/rules')
  return { ...saved, id: String(saved.id), rules: decodeRules(saved.rules), createdAt: saved.createdAt.toISOString() }
}
