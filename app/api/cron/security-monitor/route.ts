import { NextResponse } from 'next/server'
import { hasCronAuthorization } from '@/lib/security/cron-auth'
import { processSecurityWindow } from '@/lib/security/monitor'
import { escapeEmailHtml, sendOwnerEmail } from '@/lib/email'
import { SITE_SCOPE } from '@/lib/site-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!hasCronAuthorization(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  try {
    const result = await processSecurityWindow()
    let mail = 'not_needed'

    if (result.state === 'new_incident' && result.incidentId) {
      const subject = `Security alert · ${SITE_SCOPE}`
      const text = `A new Cloudflare security incident was detected for ${SITE_SCOPE}.\n\nBlocked or challenged requests in the 60-second window: ${result.count.toLocaleString()}.\nIncident ID: ${result.incidentId}.\n\nSign in to the dashboard to review the current aggregate security status.`
      const safeSite = escapeEmailHtml(SITE_SCOPE)
      const safeIncidentId = escapeEmailHtml(result.incidentId)
      const delivery = await sendOwnerEmail({
        subject,
        text,
        html: `<p>A new Cloudflare security incident was detected for <strong>${safeSite}</strong>.</p><p>Blocked or challenged requests in the 60-second window: <strong>${result.count.toLocaleString()}</strong>.</p><p>Incident ID: <code>${safeIncidentId}</code></p><p>Sign in to the dashboard to review the current aggregate security status.</p>`,
        idempotencyKey: `security-alert/${result.incidentId}`,
      })

      mail = delivery.sent ? 'sent' : delivery.reason
      if (!delivery.sent) {
        console.error('[security-monitor] Incident email delivery failed', {
          reason: delivery.reason,
          errorName: 'errorName' in delivery ? delivery.errorName : undefined,
          incidentId: result.incidentId,
        })
      }
    }

    return NextResponse.json({ ...result, mail, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Security monitoring check failed.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
