import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { securityAlertIncidents } from '@/lib/db/schema'
import { SITE_SCOPE } from '@/lib/site-scope'
import { CloudflareAnalyticsError, getCloudflareSnapshot, getMonitoredSiteUrl } from '@/lib/security/cloudflare'

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([\da-f]{1,6});/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d{1,7});/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10))).replace(/\s+/g, ' ').trim()
}

function readMetaContent(html: string, key: string) {
  const tag = html.match(/<meta\b[^>]*>/gi)?.find((value) => new RegExp(`\\bname\\s*=\\s*["']${key}["']`, 'i').test(value))
  const match = tag?.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? '') : null
}

async function fetchMonitoredPage() {
  const startedAt = Date.now()
  try {
    const response = await fetch(getMonitoredSiteUrl(), {
      method: 'GET',
      headers: { Accept: 'text/html' },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    })
    let html = ''
    if (response.headers.get('content-type')?.toLowerCase().includes('text/html') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let total = 0
      while (total < 96_000) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.subarray(0, 96_000 - total)
        html += decoder.decode(chunk, { stream: true })
        total += chunk.byteLength
        if (chunk.byteLength < value.byteLength) break
      }
      html += decoder.decode()
      await reader.cancel().catch(() => undefined)
    }
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    return {
      ok: response.status >= 200 && response.status < 400,
      statusCode: response.status,
      latencyMs: Date.now() - startedAt,
      pageTitle: title ? decodeHtml(title.replace(/<[^>]*>/g, ' ')) : null,
      pageDescription: readMetaContent(html, 'description'),
      contentFetchedAt: new Date().toISOString(),
    }
  } catch {
    return { ok: false, statusCode: null, latencyMs: null, pageTitle: null, pageDescription: null, contentFetchedAt: new Date().toISOString() }
  }
}

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

  const site = await fetchMonitoredPage()

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
