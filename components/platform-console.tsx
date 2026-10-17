'use client'

import { useState } from 'react'

type StreamTopic = 'all' | 'health' | 'safety' | 'security' | 'clarity'

type ConsoleSnapshot = {
  observedAt: string
  telemetryCount24h: number
  fighters: Array<{
    id: string
    name: string
    status: string
    health: number | null
    hitsTaken: number | null
    hitCapacity: number | null
    lastSeen: string | null
    signal: { label: string; confidence: string } | null
    stopped: boolean
  }>
  stops: { stopRuach?: boolean; stopXena?: boolean; stopSuperbot?: boolean; stopAll?: boolean }
  commands: Array<{ fighterName: string; strategy: string; threatType: string; status: string; createdAt: string }>
}

const topicLabels: Record<StreamTopic, string> = {
  all: 'All live reports',
  health: 'Health',
  safety: 'Safety & listening',
  security: 'Security signals',
  clarity: 'Clarity & freshness',
}

const topicDescriptions: Record<StreamTopic, string> = {
  all: 'Capture the current verified status, recent signal interpretations, and directive queue in one text record.',
  health: 'Capture reported health percentages, hit counts, and each fighter’s last verified telemetry time.',
  safety: 'Capture emergency stop states and the mandatory MM-listening pass/fail rule. Polling heartbeats are not persisted by this app.',
  security: 'Capture authenticated signal interpretations and directive status. These reports do not prove a network firewall is active.',
  clarity: 'Capture the observation timestamp, report count, data freshness, and whether a signal is reported or heuristic.',
}

function formatSnapshot(snapshot: ConsoleSnapshot, topic: StreamTopic) {
  const lines = [
    `BOT🍓CONTROL · ${topicLabels[topic].toUpperCase()}`,
    `Observed: ${new Date(snapshot.observedAt).toISOString()}`,
    `Authenticated telemetry reports in the last 24 hours: ${snapshot.telemetryCount24h}`,
  ]

  if (topic === 'all' || topic === 'health') {
    lines.push('', '[HEALTH]')
    for (const fighter of snapshot.fighters) {
      const health = fighter.health === null ? 'NO VERIFIED HEALTH REPORT' : `${fighter.health}%`
      const hits = fighter.hitsTaken === null || fighter.hitCapacity === null
        ? 'hit count unavailable'
        : `${fighter.hitsTaken}/${fighter.hitCapacity} hits`
      lines.push(`${fighter.name}: ${health}; ${hits}; last report ${fighter.lastSeen ?? 'never'}`)
    }
  }

  if (topic === 'all' || topic === 'safety') {
    lines.push(
      '',
      '[SAFETY & MM LISTENING]',
      `Emergency stops: all=${Boolean(snapshot.stops.stopAll)}, Ruach=${Boolean(snapshot.stops.stopRuach)}, Xena=${Boolean(snapshot.stops.stopXena)}, SuperBot=${Boolean(snapshot.stops.stopSuperbot)}`,
      'PASS: an authenticated bot continues polling the MM inbox, including while an execution stop is active.',
      'FAIL: a bot stops polling, disconnects its MM channel, or treats an execution stop as permission to stop listening.',
      'Listener heartbeat status: UNVERIFIED here; this console does not persist inbox-poll heartbeats.',
    )
  }

  if (topic === 'all' || topic === 'security') {
    lines.push('', '[SECURITY SIGNALS]')
    for (const fighter of snapshot.fighters) {
      lines.push(`${fighter.name}: ${fighter.signal ? `${fighter.signal.label} (${fighter.signal.confidence})` : 'no recent signal'}`)
    }
    lines.push('Network firewall/WAF status: NOT EXPOSED by this app; verify separately in the Vercel or site-edge firewall controls.')
  }

  if (topic === 'all' || topic === 'clarity') {
    lines.push('', '[CLARITY & DIRECTIVES]')
    lines.push(`Source: authenticated bot telemetry and the command queue; refreshed from the server at ${new Date(snapshot.observedAt).toISOString()}.`)
    lines.push(`Recent directives returned: ${snapshot.commands.length}`)
    for (const command of snapshot.commands) {
      lines.push(`${command.fighterName}: ${command.threatType.replaceAll('_', ' ')} · ${command.strategy.replaceAll('_', ' ')} · ${command.status} · ${command.createdAt}`)
    }
    lines.push('Interpretations marked heuristic are pattern hints, not confirmed incidents.')
  }

  return lines.join('\n')
}

export function PlatformConsole() {
  const [topic, setTopic] = useState<StreamTopic>('all')
  const [records, setRecords] = useState<string[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [notice, setNotice] = useState('')

  async function captureSnapshot() {
    setIsCapturing(true)
    setNotice('')
    try {
      const response = await fetch('/api/operations', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Live reports are unavailable or this session has expired.')
      const snapshot = await response.json() as ConsoleSnapshot
      const nextRecord = formatSnapshot(snapshot, topic)
      setRecords((current) => [nextRecord, ...current].slice(0, 20))
      setNotice(`Text record captured at ${new Date(snapshot.observedAt).toLocaleTimeString()}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Text record could not be captured.')
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <section className="panel platform-console" aria-labelledby="console-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">TEXT ONLY · AUTHENTICATED REPORTS</p><h2 id="console-heading">Live data console</h2></div>
        <span className="console-refresh">Live status refreshes every 5 seconds</span>
      </div>
      <div className="console-columns">
        <div className="console-recorder">
          <label className="control-label" htmlFor="stream-topic">Choose a report stream</label>
          <div className="console-controls">
            <select id="stream-topic" value={topic} onChange={(event) => setTopic(event.target.value as StreamTopic)}>
              {(Object.entries(topicLabels) as [StreamTopic, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="button button-primary capture-button" type="button" onClick={captureSnapshot} disabled={isCapturing}>
              {isCapturing ? 'Capturing text…' : 'Record live snapshot'}
            </button>
          </div>
          <p className="console-description">{topicDescriptions[topic]} Records remain plain text in this page session and are not saved to a database or browser storage.</p>
          <label className="sr-only" htmlFor="text-records">Captured live text records</label>
          <textarea id="text-records" className="text-records" readOnly value={records.join('\n\n────────────────────────\n\n')} placeholder="Choose a stream and record a fresh snapshot. No events are simulated." />
          <p className="action-feedback" role="status" aria-live="polite">{notice}</p>
        </div>
        <aside className="platform-map" aria-labelledby="platform-map-heading">
          <div className="map-heading"><span className="section-kicker">HOW TO USE THIS PLATFORM</span><span className="pass-fail">PASS / FAIL · REQUIRED</span></div>
          <h3 id="platform-map-heading">Platform map</h3>
          <p className="map-intro">Each dropdown selection controls the text captured in column one. Use only verified bot reports; missing data is not a pass.</p>
          <div className="guide-block">
            <h4>Strike combos</h4>
            <p>Choose one fighter’s combo to queue its assigned defensive response for montemader.com. Check the activity status and wait for that fighter’s completion report. A queued combo is not proof that traffic was blocked.</p>
          </div>
          <div className="guide-block">
            <h4>Block & protect immediately</h4>
            <p>Use the site’s Vercel or edge WAF controls to block traffic; this console cannot apply firewall rules. In this console, queue a defensive response only for a connected fighter. An emergency stop blocks new execution but must never stop MM inbox polling.</p>
          </div>
          <p className="listener-contract"><strong>Listener rule:</strong> PASS only while the bot keeps polling MM. FAIL if it stops listening, even during a stop. This app instructs and checks an individual authenticated poll but cannot prove future polling.</p>
        </aside>
      </div>
    </section>
  )
}
