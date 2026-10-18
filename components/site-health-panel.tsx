'use client'

import useSWR from 'swr'
import { MailSorter } from '@/components/mail-sorter'
import { formatCentralDateTime, formatCentralTime } from '@/lib/format-time'

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
  activeIncident: { detectedAt: string; lastTriggeredAt: string; blockedCount: number } | null
}

class HealthRequestError extends Error {
  constructor(public status: number) {
    super('Live security data is unavailable.')
    this.name = 'HealthRequestError'
  }
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new HealthRequestError(response.status)
  return response.json()
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

export function SiteHealthPanel() {
  const { data, error, isLoading, mutate } = useSWR<HealthSnapshot>('/api/security/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  return (
    <section className="panel site-health-panel" aria-labelledby="site-health-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">LIVE · CLOUDFLARE + SITE CHECK</p><h2 id="site-health-heading">Website health &amp; security</h2></div>
        <div className="health-actions">
          <button className="text-button" type="button" onClick={() => void mutate()} disabled={isLoading}>Refresh data</button>
          <span className="health-help">HTTP is the site&apos;s status code. Response time in ms means milliseconds; lower is usually faster.</span>
        </div>
      </div>
      <p className="health-description">Cloudflare zone analytics when connected, plus a direct HTTPS check of {data?.domain ?? 'montemader.com'}. Aggregate request data only; no visitor IP history.</p>
      {error ? (
        error instanceof HealthRequestError && error.status === 401 ? (
          <div className="health-auth-state" role="status">
            <div className="health-auth-callout">
              <strong>Confirmed: authenticated security view required</strong>
              <p>A 401 Unauthorized response is expected without an active signed-in app session. The Cloudflare connector and requested <code>Zone.Analytics:Read</code> scope were not altered; this response does not verify the live grant.</p>
            </div>
            <div className="health-auth-details">
              <strong>Next verification</strong>
              <p>Open this security dashboard in an active signed-in session and refresh to see the live Cloudflare feed status. No sample values are shown.</p>
            </div>
            <div className="health-auth-footer"><span>Session state: 401 Unauthorized · unauthenticated view</span><strong>Status: Sign-in required for verification</strong></div>
          </div>
        ) : (
          <div className="health-unavailable" role="alert">The live health snapshot could not be loaded. Verify your session and database connection, then refresh. No sample values are shown.</div>
        )
      ) : isLoading || !data ? (
        <p className="health-loading" role="status">Connecting to live security data…</p>
      ) : (
        <>
          <div className="health-status-row">
            <span className={`health-status ${data.site.ok ? 'health-good' : 'health-bad'}`}>Website {data.site.ok ? 'reachable' : 'unavailable'}</span>
            {data.cloudflare.available ? (
              <a className={`health-status health-status-link ${data.cloudflare.metrics.thresholdMet ? 'health-bad' : 'health-good'}`} href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">{data.cloudflare.metrics.thresholdMet ? 'Security alert · open Cloudflare' : 'Cloudflare online · open dashboard'}</a>
            ) : (
              <>
                <span className="health-status health-attention">Cloudflare unavailable</span>
                <a className="health-status health-status-link health-attention" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Open Cloudflare</a>
              </>
            )}
            <span className="health-observed">Checked {formatCentralTime(data.capturedAt)}</span>
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
          <MailSorter />
          {data.activeIncident && <p className="health-incident"><strong>Active incident:</strong> detected {formatCentralDateTime(data.activeIncident.detectedAt)} · {data.activeIncident.blockedCount.toLocaleString()} recent blocked/challenged requests.</p>}
        </>
      )}
      <p className="health-caveat">The alert is based on Cloudflare-reported blocked/challenged events, not proof of attacker identity. Defensive containment is only Cloudflare’s existing edge action.</p>
    </section>
  )
}
