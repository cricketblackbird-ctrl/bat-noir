'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

type StreamTopic = 'all' | 'health' | 'safety' | 'security' | 'clarity'

type ActiveAttack = {
  state: 'active'
  evidence: string
  confidence: string
  detectedAt: string
  expiresAt: string
  correlated: boolean
  reportCount: number
  sourceCount: number
  sources: Array<{ id: string; name: string }>
  reports: Array<{ fighterId: string; fighterName: string; receivedAt: string; category: string | null; vector: string | null; signature: string | null }>
}

type ConsoleSnapshot = {
  domain: string
  observedAt: string
  activeAttack: ActiveAttack | null
  systemHealth: string
  wafStatus: string
  telemetryCount24h: number
  fighters: Array<{
    id: string
    name: string
    role: string
    status: string
    health: number | null
    hitsTaken: number | null
    hitCapacity: number | null
    lastSeen: string | null
    listenerStatus: 'PASS' | 'FAIL'
    lastInboxPoll: string | null
    credentialBoundary: string
    signal: { label: string; confidence: string } | null
    stopped: boolean
  }>
  stops: { stopRuach?: boolean; stopXena?: boolean; stopSuperbot?: boolean; stopAll?: boolean }
  commands: Array<{ fighterName: string; strategy: string; threatType: string; status: string; createdAt: string }>
}

const fetcher = async (url: string): Promise<ConsoleSnapshot> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Live reports are unavailable or this session has expired.')
  return response.json() as Promise<ConsoleSnapshot>
}

const topicLabels: Record<StreamTopic, string> = {
  all: 'All live reports',
  health: 'Health & listening',
  safety: 'Safety & listening',
  security: 'Security signals',
  clarity: 'Clarity & freshness',
}

const topicDescriptions: Record<StreamTopic, string> = {
  all: 'Capture current authenticated status, listener heartbeats, signal interpretations, and the directive queue.',
  health: 'Capture reported health, hit counts, and MM inbox-listener PASS/FAIL for each fighter.',
  safety: 'Capture emergency stop states and the mandatory MM-listening PASS/FAIL rule. Stops never authorize a bot to stop listening.',
  security: 'Capture authenticated signal interpretations, active-attack correlation, and credential boundaries. Website request data is not ingested; WAF status remains unverified.',
  clarity: 'Capture observation time, report count, freshness, and whether a signal is reported or heuristic.',
}

function formatSnapshot(snapshot: ConsoleSnapshot, topic: StreamTopic) {
  const lines = [
    `BOT🍓CONTROL · ${topicLabels[topic].toUpperCase()}`,
    `Domain: ${snapshot.domain}`,
    `Observed: ${new Date(snapshot.observedAt).toISOString()}`,
    `System health (listener contract): ${snapshot.systemHealth}`,
    `Authenticated telemetry reports in the last 24 hours: ${snapshot.telemetryCount24h}`,
    '',
    '[ATTACK-GATED INBOX ROUTING]',
    snapshot.activeAttack
      ? `Active attack report until ${new Date(snapshot.activeAttack.expiresAt).toISOString()}; ${snapshot.activeAttack.reportCount} correlated report(s) from ${snapshot.activeAttack.sources.map((source) => source.name).join(', ')}.`
      : 'No fresh authenticated hit report; no attack packet is available in fighter inboxes.',
    'Only authenticated bot hit reports activate this 60-second window. This app inbox is not a network tunnel, does not proxy website traffic, and does not hide the hosting origin.',
  ]

  if (topic === 'all' || topic === 'health') {
    lines.push('', '[HEALTH & MM LISTENER]')
    for (const fighter of snapshot.fighters) {
      const health = fighter.health === null ? 'NO VERIFIED HEALTH REPORT' : `${fighter.health}% reported`
      const hits = fighter.hitsTaken === null || fighter.hitCapacity === null
        ? 'hit count unavailable'
        : `${fighter.hitsTaken}/${fighter.hitCapacity} hits`
      const inboxPoll = fighter.lastInboxPoll ? new Date(fighter.lastInboxPoll).toISOString() : 'never verified'
      lines.push(`${fighter.name} · ${fighter.role}: ${health}; ${hits}; inbox polling ${fighter.listenerStatus}; last poll ${inboxPoll}`)
    }
  }

  if (topic === 'all' || topic === 'safety') {
    lines.push(
      '',
      '[SAFETY & MM LISTENING]',
      `Emergency stops: all=${Boolean(snapshot.stops.stopAll)}, Ruach=${Boolean(snapshot.stops.stopRuach)}, Xena=${Boolean(snapshot.stops.stopXena)}, SuperBot=${Boolean(snapshot.stops.stopSuperbot)}`,
    )
    for (const fighter of snapshot.fighters) lines.push(`${fighter.name}: MM inbox listening ${fighter.listenerStatus}; execution ${fighter.stopped ? 'stopped' : 'not stopped'}`)
    lines.push('PASS requires a fresh authenticated listener_heartbeat (15 seconds or newer). FAIL means the heartbeat is missing, expired, or invalid.')
  }

  if (topic === 'all' || topic === 'security') {
    lines.push('', '[SECURITY SIGNALS]')
    for (const fighter of snapshot.fighters) {
      lines.push(`${fighter.name}: ${fighter.signal ? `${fighter.signal.label} (${fighter.signal.confidence})` : 'no recent signal'} · ${fighter.credentialBoundary}`)
    }
    lines.push(`Network firewall/WAF status: ${snapshot.wafStatus}`)
  }

  if (topic === 'all' || topic === 'clarity') {
    lines.push('', '[CLARITY & DIRECTIVES]')
    lines.push(`Source: authenticated agent reports and the command queue; observed ${new Date(snapshot.observedAt).toISOString()}.`)
    lines.push(`Recent directives returned: ${snapshot.commands.length}`)
    for (const command of snapshot.commands) {
      lines.push(`${command.fighterName}: ${command.threatType.replaceAll('_', ' ')} · ${command.strategy.replaceAll('_', ' ')} · ${command.status} · ${new Date(command.createdAt).toISOString()}`)
    }
    lines.push('Interpretations marked heuristic are pattern hints, not confirmed incidents. No simulated events are added.')
  }

  return lines.join('\n')
}

export function PlatformConsole() {
  const [topic, setTopic] = useState<StreamTopic>('all')
  const [records, setRecords] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const lastRecordedAt = useRef<string | null>(null)
  const { data, error, isLoading, mutate } = useSWR<ConsoleSnapshot>('/api/operations', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    dedupingInterval: 1000,
  })

  useEffect(() => {
    if (!isRecording || !data || lastRecordedAt.current === data.observedAt) return
    lastRecordedAt.current = data.observedAt
    setRecords((current) => [formatSnapshot(data, topic), ...current].slice(0, 20))
    setNotice(`Live text record captured at ${new Date(data.observedAt).toLocaleTimeString()}.`)
  }, [data, isRecording, topic])

  function toggleRecording() {
    setNotice('')
    setIsRecording((current) => !current)
    if (!isRecording) void mutate()
    else setNotice('Live text stream paused.')
  }

  function clearRecords() {
    setRecords([])
    lastRecordedAt.current = data?.observedAt ?? null
    setNotice('Session text records cleared.')
  }

  return (
    <section className="panel platform-console" aria-labelledby="console-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">TEXT ONLY · AUTHENTICATED REPORTS</p><h2 id="console-heading">Live data console</h2></div>
        <span className="console-refresh">{isRecording ? 'Recording · refreshes every 5 seconds' : 'Updates every 5 seconds'}</span>
      </div>
      <div className="console-columns">
        <div className="console-recorder">
          <label className="control-label" htmlFor="stream-topic">Choose a report stream</label>
          <div className="console-controls">
            <select id="stream-topic" value={topic} onChange={(event) => setTopic(event.target.value as StreamTopic)}>
              {(Object.entries(topicLabels) as [StreamTopic, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="button button-primary capture-button" type="button" onClick={toggleRecording} disabled={isLoading && !data}>
              {isRecording ? 'Pause live text stream' : 'Record live text stream'}
            </button>
          </div>
          <p className="console-description">{topicDescriptions[topic]} Text records stay in this page session only; they are not saved to a database or browser storage.</p>
          <p className={`attack-route-status${data?.activeAttack ? ' is-active' : ''}`} role="status" aria-live="polite">
            {data?.activeAttack
              ? `Attack report active · inbox packet expires ${new Date(data.activeAttack.expiresAt).toLocaleTimeString()}`
              : 'No active attack report · no packet routed'}
          </p>
          <div className="console-record-actions">
            <span className="console-stream-state" role="status">{error ? 'Live reports unavailable' : isRecording ? 'Live recording active' : isLoading ? 'Connecting to live reports…' : 'Live reports connected'}</span>
            <button className="text-button console-clear" type="button" onClick={clearRecords} disabled={records.length === 0}>Clear text</button>
          </div>
          <label className="sr-only" htmlFor="text-records">Captured live text records</label>
          <textarea id="text-records" className="text-records" readOnly value={records.join('\n\n────────────────────────\n\n')} placeholder="Choose a stream and start recording. Only authenticated reports are shown; no events are simulated." />
          <p className="action-feedback" role="status" aria-live="polite">{notice}</p>
        </div>
        <aside className="platform-map" aria-labelledby="platform-map-heading">
          <div className="map-heading"><span className="section-kicker">HOW TO USE THIS PLATFORM</span><span className="pass-fail">PASS / FAIL · REQUIRED</span></div>
          <h3 id="platform-map-heading">Platform map</h3>
          <p className="map-intro">Each dropdown selection controls the text captured in column one. Missing or expired data is a fail—not a pass.</p>
          <div className="guide-block">
            <h4>Queue a defensive combo</h4>
            <p>Choose one fighter to queue its assigned response for montemader.com. A queued combo is not proof that traffic was blocked; verify a completion report and edge controls separately.</p>
          </div>
          <div className="guide-block">
            <h4>Protect the site</h4>
            <p>Attack reports are exposed only through each fighter&apos;s separate authenticated inbox during the 60-second active-report window. This app does not ingest website requests, proxy traffic, hide the origin, or apply WAF rules; configure those at your hosting or edge provider.</p>
          </div>
          <p className="listener-contract"><strong>Listener rule:</strong> PASS requires a fresh authenticated heartbeat. FAIL if it is missing or older than 15 seconds—even during an execution stop. This status is agent-reported, not proof of future polling.</p>
        </aside>
      </div>
    </section>
  )
}
