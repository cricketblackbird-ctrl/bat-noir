'use client'

import { useState } from 'react'
import useSWR from 'swr'

type HealthSnapshot = {
  domain: string
  capturedAt: string
  cloudflare:
    | {
        available: true
        metrics: {
          requests24h: number
          bytes24h: number
          cachedRequests24h: number
          threatRequests24h: number
          blockedOrChallenged60s: number
          blocked60s: number
          challenged60s: number
          threshold: number
          thresholdMet: boolean
          firewallActions: Array<{ action: string; source: string; count: number }>
          countries: Array<{ country: string; count: number }>
        }
      }
    | {
        available: false
        reason: 'zone_not_configured' | 'connect_token_unavailable' | 'permission_denied' | 'query_rejected' | 'zone_not_found' | 'rate_limited' | 'request_timeout' | 'upstream_unavailable' | 'unknown_error'
      }
  site: { ok: boolean; statusCode: number | null; latencyMs: number | null }
  activeIncident: { detectedAt: string; lastTriggeredAt: string; blockedCount: number; smsStatus: string; smsSentAt: string | null } | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Live security data is unavailable.')
  return response.json()
}

type CloudflareIssueReason = Extract<HealthSnapshot['cloudflare'], { available: false }>['reason']

function cloudflareIssueMessage(reason: CloudflareIssueReason) {
  switch (reason) {
    case 'zone_not_configured':
      return 'CLOUDFLARE_ZONE_ID is missing. Set it to the Cloudflare zone ID for montemader.com.'
    case 'connect_token_unavailable':
      return 'The existing Montemader Security Telemetry connector did not issue an app token. Verify its current app grant; no new connector is needed.'
    case 'permission_denied':
      return 'Cloudflare rejected the current token. It needs Account Analytics:Read or Zone Analytics:Read access for montemader.com.'
    case 'query_rejected':
      return 'Cloudflare rejected the analytics query. Confirm the zone supports HTTP request and firewall analytics.'
    case 'zone_not_found':
      return 'The configured zone ID returned no analytics for montemader.com. Confirm CLOUDFLARE_ZONE_ID matches the connected zone.'
    case 'rate_limited':
      return 'Cloudflare rate-limited this request. Retry shortly.'
    case 'request_timeout':
      return 'The Cloudflare analytics request timed out. Retry shortly.'
    case 'upstream_unavailable':
      return 'Cloudflare could not be reached right now. Retry shortly.'
    default:
      return 'The Cloudflare analytics request could not be completed. No sample values are shown.'
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

export function SiteHealthPanel({ canTestSms }: { canTestSms: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<HealthSnapshot>('/api/security/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  const [sendingTest, setSendingTest] = useState(false)
  const [notice, setNotice] = useState('')

  async function sendTestMessage() {
    setSendingTest(true)
    setNotice('')
    try {
      const response = await fetch('/api/security/test-sms', { method: 'POST', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not send the SMS test.')
      setNotice(`Test SMS sent: “${result.message}”`)
    } catch (sendError) {
      setNotice(sendError instanceof Error ? sendError.message : 'Could not send the SMS test.')
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <section className="panel site-health-panel" aria-labelledby="site-health-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">LIVE · CLOUDFLARE + SITE CHECK</p><h2 id="site-health-heading">Website health &amp; security</h2></div>
        <div className="health-actions">
          <button className="text-button" type="button" onClick={() => void mutate()} disabled={isLoading}>Refresh data</button>
          {canTestSms && <button className="button button-primary health-test-button" type="button" onClick={sendTestMessage} disabled={sendingTest}>{sendingTest ? 'Sending…' : 'Send SMS test'}</button>}
        </div>
      </div>
      <p className="health-description">Verified Cloudflare zone analytics and a direct HTTPS check of {data?.domain ?? 'montemader.com'}. Aggregate request data only; no visitor IP history.</p>
      {error ? (
        <div className="health-unavailable" role="alert">The live health snapshot could not be loaded. Verify your session and database connection, then refresh. No sample values are shown.</div>
      ) : isLoading || !data ? (
        <p className="health-loading" role="status">Connecting to live security data…</p>
      ) : (
        <>
          <div className="health-status-row">
            <span className={`health-status ${data.site.ok ? 'health-good' : 'health-bad'}`}>Website {data.site.ok ? 'reachable' : 'unavailable'}</span>
            {data.cloudflare.available ? (
              <span className={`health-status ${data.cloudflare.metrics.thresholdMet ? 'health-bad' : 'health-good'}`}>{data.cloudflare.metrics.thresholdMet ? 'Attack threshold met' : 'Cloudflare live · no threshold met'}</span>
            ) : (
              <span className="health-status health-attention">Cloudflare analytics unavailable</span>
            )}
            <span className="health-observed">Checked {new Date(data.capturedAt).toLocaleTimeString()}</span>
          </div>
          <div className="health-metrics">
            <article><span>HTTP status</span><strong>{data.site.statusCode ?? 'No response'}</strong></article>
            <article><span>Response time</span><strong>{data.site.latencyMs === null ? 'Unavailable' : `${data.site.latencyMs} ms`}</strong></article>
            {data.cloudflare.available && <>
              <article><span>Requests · 24h</span><strong>{data.cloudflare.metrics.requests24h.toLocaleString()}</strong></article>
              <article><span>Transfer · 24h</span><strong>{formatBytes(data.cloudflare.metrics.bytes24h)}</strong></article>
              <article><span>Blocked · 60s</span><strong>{data.cloudflare.metrics.blocked60s.toLocaleString()}</strong></article>
              <article><span>Challenged · 60s</span><strong>{data.cloudflare.metrics.challenged60s.toLocaleString()}</strong></article>
            </>}
          </div>
          {data.cloudflare.available ? (
            <div className="health-details">
              <p><strong>Alert rule:</strong> {data.cloudflare.metrics.threshold} blocked or challenged requests within 60 seconds. Automatic monitoring checks once per minute; one SMS is sent for a new incident.</p>
              <p><strong>Cloudflare threats · 24h:</strong> {data.cloudflare.metrics.threatRequests24h.toLocaleString()} <span aria-hidden="true">·</span> <strong>Cached requests:</strong> {data.cloudflare.metrics.cachedRequests24h.toLocaleString()}</p>
              {data.cloudflare.metrics.firewallActions.length > 0 && <div><h3>Recent firewall activity</h3><ul className="health-event-list">{data.cloudflare.metrics.firewallActions.map((event) => <li key={`${event.action}-${event.source}`}><span>{event.action.replace(/_/g, ' ')} · {event.source.replace(/_/g, ' ')}</span><strong>{event.count.toLocaleString()}</strong></li>)}</ul></div>}
              {data.cloudflare.metrics.countries.length > 0 && <p><strong>Top firewall-event countries · 60s:</strong> {data.cloudflare.metrics.countries.map((entry) => `${entry.country} ${entry.count}`).join(' · ')}</p>}
            </div>
          ) : (
            <div className="health-diagnostic" role="status"><strong>Live Cloudflare analytics unavailable:</strong> {cloudflareIssueMessage(data.cloudflare.reason)} No sample values are shown.</div>
          )}
          {data.activeIncident && <p className="health-incident"><strong>Active incident:</strong> detected {new Date(data.activeIncident.detectedAt).toLocaleString()} · {data.activeIncident.blockedCount.toLocaleString()} recent blocked/challenged requests · SMS {data.activeIncident.smsStatus}{data.activeIncident.smsSentAt ? ` at ${new Date(data.activeIncident.smsSentAt).toLocaleTimeString()}` : ''}.</p>}
        </>
      )}
      <p className="health-notice" role="status" aria-live="polite">{notice}</p>
      <p className="health-caveat">The alert is based on Cloudflare-reported blocked/challenged events, not proof of attacker identity. Defensive containment is only Cloudflare’s existing edge action; this dashboard does not retaliate or destroy systems.</p>
    </section>
  )
}
