import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { securityAlertIncidents } from '@/lib/db/schema'
import { SITE_SCOPE } from '@/lib/site-scope'
import { CloudflareAnalyticsError, getCloudflareSnapshot, getMonitoredSiteUrl } from '@/lib/security/cloudflare'

export async function getSiteHealthSnapshot() {
  const cloudflareStatus = getCloudflareSnapshot()
    .then((metrics) => ({ available: true as const, metrics }))
    .catch((error: unknown) => ({
      available: false as const,
      reason: error instanceof CloudflareAnalyticsError ? error.reason : 'unknown_error' as const,
    }))
  const [cloudflare, activeIncident] = await Promise.all([
    cloudflareStatus,
    db.select().from(securityAlertIncidents)
      .where(and(eq(securityAlertIncidents.siteScope, SITE_SCOPE), eq(securityAlertIncidents.status, 'active')))
      .orderBy(desc(securityAlertIncidents.detectedAt)).limit(1)
      .then((rows) => rows[0] ?? null),
  ])

  let site: { ok: boolean; statusCode: number | null; latencyMs: number | null }
  const startedAt = Date.now()
  try {
    const response = await fetch(getMonitoredSiteUrl(), {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    })
    site = { ok: response.status >= 200 && response.status < 400, statusCode: response.status, latencyMs: Date.now() - startedAt }
  } catch {
    site = { ok: false, statusCode: null, latencyMs: null }
  }

  return {
    domain: SITE_SCOPE,
    capturedAt: cloudflare.available ? cloudflare.metrics.capturedAt : new Date().toISOString(),
    cloudflare,
    site,
    activeIncident: activeIncident ? {
      detectedAt: activeIncident.detectedAt.toISOString(),
      lastTriggeredAt: activeIncident.lastTriggeredAt.toISOString(),
      blockedCount: activeIncident.blockedCount,
    } : null,
  }
}

export async function processSecurityWindow() {
  const snapshot = await getCloudflareSnapshot()
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`site-security:${SITE_SCOPE}`}))`)
    const [active] = await tx.select().from(securityAlertIncidents)
      .where(and(eq(securityAlertIncidents.siteScope, SITE_SCOPE), eq(securityAlertIncidents.status, 'active')))
      .limit(1)

    if (!snapshot.thresholdMet) {
      if (active) {
        await tx.update(securityAlertIncidents)
          .set({ status: 'resolved', resolvedAt: new Date(), lastTriggeredAt: new Date(), blockedCount: snapshot.blockedOrChallenged60s })
          .where(eq(securityAlertIncidents.id, active.id))
      }
      return { state: 'clear' as const, count: snapshot.blockedOrChallenged60s, incidentId: active?.id ?? null }
    }

    if (active) {
      await tx.update(securityAlertIncidents)
        .set({ lastTriggeredAt: new Date(), blockedCount: snapshot.blockedOrChallenged60s })
        .where(eq(securityAlertIncidents.id, active.id))
      return { state: 'active' as const, count: snapshot.blockedOrChallenged60s, incidentId: active.id }
    }

    const now = new Date()
    const [incident] = await tx.insert(securityAlertIncidents).values({
      siteScope: SITE_SCOPE,
      status: 'active',
      detectedAt: now,
      lastTriggeredAt: now,
      blockedCount: snapshot.blockedOrChallenged60s,
    }).returning({ id: securityAlertIncidents.id })

    return { state: 'new_incident' as const, count: snapshot.blockedOrChallenged60s, incidentId: incident.id }
  })
}
