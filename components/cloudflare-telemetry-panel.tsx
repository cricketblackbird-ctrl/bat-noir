'use client'

import useSWR from 'swr'
import { LockKeyhole, Network, Shield, Terminal } from 'lucide-react'
import { DnsHistoryPanel } from '@/components/dns-history-panel'

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
          recentEvents: Array<{ minute: string; action: string; source: string; country: string; count: number }>
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

function formatEventMinute(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
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
  const feedStatus = metrics ? 'PASS' : 'FAIL'

  return (
    <section id="cloudflare-security-view" className="panel telemetry-panel" aria-labelledby="telemetry-heading" tabIndex={-1}>
      <div className="panel-heading telemetry-heading">
        <div>
          <p className="section-kicker">MAGIC DRAGONS · LIVE AGGREGATE EDGE SIGNALS</p>
          <h2 id="telemetry-heading">Magic Dragons</h2>
        </div>
        <div className="telemetry-controls">
          <span className={`telemetry-feed-state ${metrics ? 'is-connected' : 'is-offline'}`} role="status">
            <span aria-hidden="true" />{feedStatus}
          </span>
          <button className="telemetry-refresh" type="button" onClick={() => void mutate()} disabled={isValidating} aria-label="Refresh Cloudflare security feed">
            {isValidating ? 'Refreshing…' : 'Refresh feed'}
          </button>
        </div>
      </div>

      <section className="origin-isolation-card" aria-labelledby="origin-isolation-heading">
        <header className="origin-isolation-topbar">
          <div className="origin-isolation-brand">
            <span className="origin-isolation-icon" aria-hidden="true"><Network /></span>
            <div>
              <p className="section-kicker">MONTEMADER.COM · ORIGIN CONTROL</p>
              <h3 id="origin-isolation-heading">Cloudflare Tunnel <code>cloudflared</code></h3>
              <p className="origin-isolation-subtitle">Origin isolation: <strong>unverified</strong> · no tunnel health source connected</p>
            </div>
          </div>
        </header>

        <div className="origin-isolation-metrics">
          <article>
            <span>Connector health</span>
            <strong>Not reported</strong>
            <small>No persistent <code>cloudflared</code> health source</small>
          </article>
          <article>
            <span>Origin exposure</span>
            <strong>Unverified</strong>
            <small>No origin firewall state available to this app</small>
          </article>
          <article>
            <span>Cloudflare edge feed</span>
            <strong className={metrics ? 'is-feed-connected' : 'is-feed-unavailable'}>{metrics ? 'Connected' : isLoading ? 'Connecting' : 'Unavailable'}</strong>
            <small>Aggregate security metrics only</small>
          </article>
        </div>

        <section className="origin-diagnostics" aria-labelledby="origin-diagnostics-heading">
          <header className="origin-diagnostics-heading">
            <div className="origin-diagnostics-title">
              <Terminal aria-hidden="true" />
              <div>
                <h4 id="origin-diagnostics-heading">Tunnel diagnostics</h4>
                <p>No connector telemetry · not a live daemon log</p>
              </div>
            </div>
          </header>
          <div className="origin-diagnostics-log" role="group" aria-label="Tunnel diagnostic status">
            <p><span>[INFO]</span> No Cloudflare Tunnel connector is reporting to this dashboard.</p>
            <p><span>[INFO]</span> This dashboard runs on Vercel and does not host a persistent <code>cloudflared</code> daemon.</p>
            <p><span>[WARN]</span> Origin IP visibility and inbound firewall rules cannot be verified here.</p>
            <p><span>[DATA]</span> Cloudflare edge feed: {metrics ? 'aggregate metrics received; raw visitor IPs are not displayed.' : 'no current aggregate metrics available.'}</p>
          </div>
        </section>

        <p className="origin-isolation-caveat"><LockKeyhole aria-hidden="true" /> This status is informational—not proof that the origin is hidden. A separate persistent origin must run the tunnel and restrict direct access; no tunnel or firewall configuration was changed.</p>
      </section>

      <p className="telemetry-description">Live data from the connected Cloudflare zone, alongside verified operations heartbeats. This view shows aggregate security details only—not visitor IP addresses or per-person histories.</p>

      {error ? (
        <p className="telemetry-message" role="alert">Could not load live security data. Check the Cloudflare connection, then select Refresh feed.</p>
      ) : isLoading && !data ? (
        <p className="telemetry-message" role="status">Connecting to the protected Cloudflare feed…</p>
      ) : data && !data.cloudflare.available ? (
        <p className="telemetry-message" role="status">No live security snapshot was returned. Check the Cloudflare connection, then select Refresh feed.</p>
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

          <section className="telemetry-stream" aria-labelledby="telemetry-stream-heading">
            <div className="telemetry-stream-heading">
              <div>
                <h3 id="telemetry-stream-heading">Recent firewall activity · 60 seconds</h3>
                <p>Cloudflare groups activity by minute, action, source, and country. Visitor IPs and request paths are not shown.</p>
              </div>
              <span>{metrics.recentEvents.length} groups</span>
            </div>
            {metrics.recentEvents.length ? (
              <ul className="telemetry-stream-list">
                {metrics.recentEvents.map((event, index) => (
                  <li key={`${event.minute}-${event.action}-${event.source}-${event.country}-${index}`}>
                    <time dateTime={event.minute}>{formatEventMinute(event.minute)}</time>
                    <div><strong>{event.action.replace(/_/g, ' ')}</strong><span>{event.source.replace(/_/g, ' ')} · {event.country}</span></div>
                    <b>{event.count.toLocaleString()}</b>
                  </li>
                ))}
              </ul>
            ) : <p className="telemetry-stream-empty">No firewall activity groups were returned in the last 60 seconds.</p>}
          </section>

          {data?.activeIncident && <p className="telemetry-incident"><strong>Active incident:</strong> {data.activeIncident.blockedCount.toLocaleString()} blocked or challenged requests; detected {formatCapturedAt(data.activeIncident.detectedAt)}.</p>}
          <p className="telemetry-updated">Cloudflare snapshot captured {data ? formatCapturedAt(data.capturedAt) : 'time unavailable'} · refreshes automatically every 30 seconds.</p>
        </>
      ) : null}

      <p className="telemetry-caveat">These are Cloudflare-reported aggregates, not proof of attacker identity. Firewall groups are limited to the results returned by the current Cloudflare query; this is not a raw event log. Defensive actions remain within Cloudflare&apos;s existing edge controls.</p>
      <DnsHistoryPanel />
    </section>
  )
}
