'use client'

import useSWR from 'swr'

type FighterHeartbeat = {
  id: string
  name: string
  listenerStatus: 'PASS' | 'WAITING' | 'STALE'
  heartbeatAgeMs: number | null
  stopped: boolean
}

type HealthSnapshot = {
  capturedAt: string
  cloudflare:
    | {
        available: true
        metrics: {
          requests24h: number
          bytes24h: number
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
    | { available: false; reason: string }
  activeIncident: { detectedAt: string; blockedCount: number } | null
}

const fetcher = async (url: string): Promise<HealthSnapshot> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Live security data is unavailable.')
  return response.json()
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

function formatCapturedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date)
}

function heartbeatLabel(fighter: FighterHeartbeat) {
  const state = fighter.listenerStatus === 'PASS'
    ? 'Heartbeat verified'
    : fighter.listenerStatus === 'STALE'
      ? 'Heartbeat stale'
      : 'Waiting for heartbeat'
  return fighter.stopped ? `${state} · execution stopped` : state
}

export function CloudflareTelemetryPanel({ fighters }: { fighters: FighterHeartbeat[] }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<HealthSnapshot>('/api/security/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  const metrics = data?.cloudflare.available ? data.cloudflare.metrics : null

  return (
    <section className="panel telemetry-panel" aria-labelledby="telemetry-heading">
      <div className="panel-heading telemetry-heading">
        <div>
          <p className="section-kicker">AGGREGATE EDGE SIGNALS · AUTHENTICATED HEARTBEATS</p>
          <h2 id="telemetry-heading">Cloudflare security telemetry</h2>
        </div>
        <div className="telemetry-controls">
          <span className={`telemetry-feed-state ${metrics ? 'is-connected' : ''}`} role="status">
            <span aria-hidden="true" />{error ? 'Feed unavailable' : isLoading ? 'Connecting' : metrics ? 'Cloudflare connected' : 'Waiting for feed'}
          </span>
          <button className="telemetry-refresh" type="button" onClick={() => void mutate()} disabled={isValidating}>
            {isValidating ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </div>

      <p className="telemetry-description">Cloudflare zone aggregates and verified operations heartbeats. This view does not collect or display visitor IP addresses or per-person histories.</p>

      {error ? (
        <p className="telemetry-message" role="alert">The protected live security snapshot could not be loaded. No sample values are shown.</p>
      ) : isLoading && !data ? (
        <p className="telemetry-message" role="status">Connecting to the protected Cloudflare feed…</p>
      ) : data && !data.cloudflare.available ? (
        <p className="telemetry-message" role="status">Cloudflare feed unavailable: {data.cloudflare.reason.replace(/_/g, ' ')}. Verify the existing connector and zone access.</p>
      ) : metrics ? (
        <>
          <div className="telemetry-metrics" aria-label="Cloudflare aggregate metrics">
            <article className="telemetry-metric telemetry-metric-highlight"><span>Blocked or challenged · 60s</span><strong>{metrics.blockedOrChallenged60s.toLocaleString()}</strong><small>Alert threshold: {metrics.threshold.toLocaleString()}</small></article>
            <article className="telemetry-metric"><span>Requests · 24h</span><strong>{metrics.requests24h.toLocaleString()}</strong><small>Cloudflare HTTP request aggregate</small></article>
            <article className="telemetry-metric"><span>Threat requests · 24h</span><strong>{metrics.threatRequests24h.toLocaleString()}</strong><small>Cloudflare-reported threats</small></article>
            <article className="telemetry-metric"><span>Data transfer · 24h</span><strong>{formatBytes(metrics.bytes24h)}</strong><small>Aggregate response bytes</small></article>
          </div>

          <div className={`telemetry-posture ${metrics.thresholdMet ? 'is-alert' : ''}`} role="status">
            <span>Firewall posture</span>
            <strong>{metrics.thresholdMet ? 'Alert threshold reached' : 'Below alert threshold'}</strong>
            <span>{metrics.blockedOrChallenged60s.toLocaleString()} / {metrics.threshold.toLocaleString()} blocked or challenged requests in the 60-second window</span>
          </div>

          <div className="telemetry-details-grid">
            <section className="telemetry-detail" aria-labelledby="telemetry-actions-heading">
              <h3 id="telemetry-actions-heading">Returned firewall action groups · 60s</h3>
              {metrics.firewallActions.length ? (
                <ul>{metrics.firewallActions.map((entry, index) => <li key={`${entry.action}-${entry.source}-${index}`}><span>{entry.action.replace(/_/g, ' ')} · {entry.source.replace(/_/g, ' ')}</span><strong>{entry.count.toLocaleString()}</strong></li>)}</ul>
              ) : <p>No grouped firewall events were returned for this window.</p>}
            </section>

            <section className="telemetry-detail" aria-labelledby="telemetry-countries-heading">
              <h3 id="telemetry-countries-heading">Top firewall-event countries · 60s</h3>
              {metrics.countries.length ? (
                <ul>{metrics.countries.map((entry) => <li key={entry.country}><span>{entry.country}</span><strong>{entry.count.toLocaleString()}</strong></li>)}</ul>
              ) : <p>No country groups were returned for this window.</p>}
            </section>

            <section className="telemetry-detail telemetry-sentinels" aria-labelledby="telemetry-sentinels-heading">
              <h3 id="telemetry-sentinels-heading">Operations heartbeat status</h3>
              {fighters.length ? (
                <ul>{fighters.map((fighter) => <li key={fighter.id}><span>{fighter.name}<small>{heartbeatLabel(fighter)}</small></span><strong className={`telemetry-heartbeat is-${fighter.listenerStatus.toLowerCase()}`}>{fighter.listenerStatus}</strong></li>)}</ul>
              ) : <p>Authenticated operations heartbeat data is not available yet.</p>}
            </section>
          </div>

          {data.activeIncident && <p className="telemetry-incident"><strong>Active incident:</strong> {data.activeIncident.blockedCount.toLocaleString()} blocked or challenged requests; detected {formatCapturedAt(data.activeIncident.detectedAt)}.</p>}
          <p className="telemetry-updated">Cloudflare snapshot captured {formatCapturedAt(data.capturedAt)} · refreshes automatically every 30 seconds.</p>
        </>
      ) : null}

      <p className="telemetry-caveat">These are Cloudflare-reported aggregates, not proof of attacker identity. Firewall groups are limited to the results returned by the current Cloudflare query; this is not a raw event log. Defensive actions remain within Cloudflare&apos;s existing edge controls.</p>
    </section>
  )
}
