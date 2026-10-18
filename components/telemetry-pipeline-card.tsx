'use client'

type TelemetryEvent = {
  id: string
  fighterId: string
  fighterName: string
  eventType: string
  actionType: string | null
  status: string | null
  healthPercent: number
  hitsTaken: number
  hitCapacity: number
  receivedAt: string
}

type PipelineSnapshot = {
  fighters: Array<{ listenerStatus: 'PASS' | 'WAITING' | 'STALE' }>
  recentTelemetry: TelemetryEvent[]
  telemetryCount24h: number
}

function eventLabel(event: TelemetryEvent) {
  return (event.actionType ?? event.eventType).replace(/_/g, ' ')
}

function eventDetails(event: TelemetryEvent) {
  const status = event.status ? `${event.status} · ` : ''
  return `${status}${event.healthPercent}% health · ${event.hitsTaken}/${event.hitCapacity} hits`
}

function eventTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function TelemetryPipelineCard({
  snapshot,
  isLoading,
  hasError,
}: {
  snapshot: PipelineSnapshot | undefined
  isLoading: boolean
  hasError: boolean
}) {
  const events = snapshot?.recentTelemetry ?? []
  const onlineHeartbeats = snapshot?.fighters.filter((fighter) => fighter.listenerStatus === 'PASS').length ?? 0
  const status = hasError
    ? 'UNAVAILABLE'
    : isLoading
      ? 'CONNECTING'
      : 'AUTHENTICATED'

  return (
    <section className="panel telemetry-pipeline-panel" aria-labelledby="pipeline-heading">
      <div className="panel-heading pipeline-heading">
        <div>
          <p className="section-kicker">AUTHENTICATED DATA FLOW</p>
          <h2 id="pipeline-heading">Live telemetry pipeline</h2>
        </div>
        <span className={`pipeline-status${hasError ? ' is-attention' : ''}`} role="status">
          <span aria-hidden="true" />{status}
        </span>
      </div>

      <p className="pipeline-description">Bot data flows through the authenticated feed into the operations database. Heartbeats and events refresh here every five seconds; no sample data is shown.</p>

      <div className="pipeline-flow" aria-label="Pipeline connection stages">
        <div className="pipeline-flow-step"><span>01</span><div><strong>Access</strong><small>{hasError ? 'Check unavailable' : isLoading ? 'Checking' : 'Authenticated'}</small></div></div>
        <span className="pipeline-flow-arrow" aria-hidden="true">→</span>
        <div className="pipeline-flow-step"><span>02</span><div><strong>Operations data</strong><small>{hasError ? 'Unavailable' : isLoading ? 'Connecting' : 'Connected'}</small></div></div>
        <span className="pipeline-flow-arrow" aria-hidden="true">→</span>
        <div className="pipeline-flow-step"><span>03</span><div><strong>Heartbeats</strong><small>{hasError ? 'Unavailable' : isLoading ? 'Checking' : `${onlineHeartbeats}/${snapshot?.fighters.length ?? 0} live`}</small></div></div>
      </div>

      <div className="pipeline-summary" aria-label="Telemetry pipeline summary">
        <div className="pipeline-metric"><span>Events · 24h</span><strong>{snapshot ? snapshot.telemetryCount24h.toLocaleString() : '—'}</strong></div>
        <div className="pipeline-metric"><span>Latest events</span><strong>{snapshot ? events.length.toLocaleString() : '—'}</strong></div>
        <div className="pipeline-metric"><span>Live heartbeats</span><strong>{snapshot ? `${onlineHeartbeats}/${snapshot.fighters.length}` : '—'}</strong></div>
      </div>

      <div className="pipeline-events-heading">
        <h3>Latest events</h3>
        <span>Newest first</span>
      </div>

      {hasError ? (
        <p className="pipeline-empty" role="alert">The operations feed could not be loaded. Existing data is not replaced with placeholders.</p>
      ) : isLoading ? (
        <p className="pipeline-empty" role="status">Connecting to the authenticated operations feed…</p>
      ) : events.length ? (
        <ul className="pipeline-event-list" aria-label="Latest telemetry reports">
          {events.slice(0, 5).map((event) => (
            <li key={event.id}>
              <div className="pipeline-event-main">
                <strong>{event.fighterName} · {eventLabel(event)}</strong>
                <span>{eventDetails(event)}</span>
              </div>
              <time dateTime={event.receivedAt}>{eventTime(event.receivedAt)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pipeline-empty">No telemetry events were received in the last 24 hours.</p>
      )}
    </section>
  )
}
