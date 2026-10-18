'use client'

import { useState } from 'react'
import { HEARTBEAT_CONFIG } from '@/lib/heartbeat-config'

type HeartbeatFighter = {
  id: string
  name: string
  role: string
  listenerStatus: 'PASS' | 'WAITING' | 'STALE'
  heartbeatAgeMs: number | null
  lastInboxPoll: string | null
  credentialBoundary: string
  stopped: boolean
  health: number | null
}

type QueuedCommand = { status: string }

type Props = {
  domain: string | null
  fighters: HeartbeatFighter[]
  commands: QueuedCommand[]
  telemetryCount24h: number | null
  isLoading: boolean
  hasError: boolean
  onRefresh: () => Promise<void>
}

function formatHeartbeatAge(ageMs: number | null) {
  if (ageMs === null) return 'No heartbeat received'
  if (ageMs < 5_000) return 'Just now'
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)} seconds ago`
  return `${Math.floor(ageMs / 60_000)} minutes ago`
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No poll recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function credentialLabel(value: string) {
  if (value === 'isolated API credential') return 'Dedicated credential verified'
  if (value === 'shared · rejected') return 'Shared credential rejected'
  return 'Credential missing'
}

export function HeartbeatReadinessPanel({
  domain,
  fighters,
  commands,
  telemetryCount24h,
  isLoading,
  hasError,
  onRefresh,
}: Props) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const watcherNames = { ruach: 'Ruach', xena: 'Xena', superbot: 'SuperBot' } as const
  const fighterById = new Map(fighters.map((fighter) => [fighter.id, fighter]))
  const watchers = HEARTBEAT_CONFIG.activeWatchers.map((id) => fighterById.get(id) ?? {
    id,
    name: watcherNames[id],
    role: 'Listener',
    listenerStatus: 'WAITING' as const,
    heartbeatAgeMs: null,
    lastInboxPoll: null,
    credentialBoundary: 'missing',
    stopped: false,
    health: null,
  })
  const listenersReady = watchers.filter((fighter) => fighter.listenerStatus === 'PASS').length
  const queuedCommands = commands.filter((command) => command.status.toLowerCase() === 'queued').length

  async function refresh() {
    setIsRefreshing(true)
    setRefreshError(false)
    try {
      await onRefresh()
    } catch {
      setRefreshError(true)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <section className="panel heartbeat-readiness-panel" aria-labelledby="heartbeat-readiness-heading">
      <div className="panel-heading heartbeat-readiness-heading">
        <div>
          <p className="section-kicker">AUTHENTICATED LISTENERS · {HEARTBEAT_CONFIG.pollIntervalMs / 1000}-SECOND POLL CONTRACT</p>
          <h2 id="heartbeat-readiness-heading">Fighter heartbeats</h2>
        </div>
        <button className="telemetry-refresh" type="button" onClick={() => void refresh()} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>

      <p className="heartbeat-readiness-copy">
        Live readiness for {HEARTBEAT_CONFIG.activeWatchers.map((id) => watcherNames[id]).join(', ')}. Each listener must poll its authenticated inbox and send a site-scoped heartbeat every {HEARTBEAT_CONFIG.pollIntervalMs / 1000} seconds; a heartbeat is fresh for {HEARTBEAT_CONFIG.maxHeartbeatAgeSec} seconds. This page reports status but does not start external listener processes.
      </p>

      <div className="heartbeat-pools" aria-label="Current operational data pools">
        <article className="heartbeat-pool"><span>Listeners ready</span><strong>{isLoading ? '—' : `${listenersReady} / ${HEARTBEAT_CONFIG.activeWatchers.length}`}</strong><small>Fresh authenticated heartbeats</small></article>
        <article className="heartbeat-pool"><span>Telemetry · 24h</span><strong>{telemetryCount24h?.toLocaleString() ?? '—'}</strong><small>Records scoped to this site</small></article>
        <article className="heartbeat-pool"><span>Queued directives</span><strong>{queuedCommands.toLocaleString()}</strong><small>Queued, not proof of execution</small></article>
        <article className="heartbeat-pool"><span>Site scope</span><strong>{domain ?? HEARTBEAT_CONFIG.siteScope}</strong><small>{domain && domain !== HEARTBEAT_CONFIG.siteScope ? `Mismatch · expected ${HEARTBEAT_CONFIG.siteScope}` : 'Required on every heartbeat'}</small></article>
      </div>

      {hasError ? (
        <p className="heartbeat-readiness-message" role="alert">Live operations status could not be loaded. Refresh the dashboard and verify the authenticated data connection.</p>
      ) : isLoading ? (
        <p className="heartbeat-readiness-message" role="status">Loading authenticated listener status…</p>
      ) : (
        <div className="heartbeat-fighter-grid">
          {watchers.map((fighter) => (
            <article className={`heartbeat-fighter heartbeat-fighter-${fighter.listenerStatus.toLowerCase()}`} key={fighter.id}>
              <div className="heartbeat-fighter-title">
                <div><p className="section-kicker">{fighter.role}</p><h3>{fighter.name}</h3></div>
                <span className={`heartbeat-state heartbeat-state-${fighter.listenerStatus.toLowerCase()}`}><span aria-hidden="true" />{fighter.listenerStatus}</span>
              </div>
              <dl className="heartbeat-fighter-details">
                <div><dt>Last heartbeat</dt><dd>{formatHeartbeatAge(fighter.heartbeatAgeMs)}</dd></div>
                <div><dt>Inbox poll</dt><dd>{formatTimestamp(fighter.lastInboxPoll)}</dd></div>
                <div><dt>Inbox endpoint</dt><dd><code>GET /api/fighters/{fighter.id}/inbox</code></dd></div>
                <div><dt>Credential boundary</dt><dd>{credentialLabel(fighter.credentialBoundary)}</dd></div>
                <div><dt>Execution</dt><dd>{fighter.stopped ? 'Stopped · listener should remain active' : 'Available'}</dd></div>
                <div><dt>Latest health</dt><dd>{fighter.health === null ? 'No authenticated report' : `${fighter.health}%`}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}

      {refreshError && <p className="heartbeat-readiness-message" role="status">Refresh failed. The last successful status remains visible.</p>}
      {domain && domain !== HEARTBEAT_CONFIG.siteScope && <p className="heartbeat-readiness-message" role="alert">Configured heartbeat site scope does not match the operations feed. Expected {HEARTBEAT_CONFIG.siteScope}; received {domain}.</p>}
      <p className="heartbeat-history-note">
        The available operations feed exposes a rolling 24-hour telemetry count, and Cloudflare exposes 24-hour and 60-second aggregates. It does not currently expose a year-to-date history, so this view does not invent annual totals or forecasts.
      </p>
    </section>
  )
}
