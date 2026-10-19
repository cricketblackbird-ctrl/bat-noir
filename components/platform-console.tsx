'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { readBrowserHints, type BrowserHints } from '@/components/browser-environment-panel'
import { fetchActivityArchive, saveActivityArchive } from '@/lib/activity-archive-client'
import type { ActivityArchiveResponse, StreamTopic } from '@/lib/activity-archive-types'
import { formatCentralDateTime, formatCentralTime } from '@/lib/format-time'

type ActiveAttack = {
  state: 'active'
  evidence: string
  confidence: string
  siteScope: string
  windowMs: number
  detectedAt: string
  expiresAt: string
  correlated: boolean
  reportCount: number
  sourceCount: number
  sources: Array<{ id: string; name: string }>
  reports: Array<{
    fighterId: string
    fighterName: string
    nodeId: string
    receivedAt: string
    healthPercent: number
    hitsTaken: number
    hitCapacity: number
    category: string | null
    vector: string | null
    signature: string | null
  }>
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
    listenerStatus: 'PASS' | 'WAITING' | 'STALE'
    lastInboxPoll: string | null
    heartbeatAgeMs: number | null
    credentialBoundary: string
    signal: { label: string; confidence: string } | null
    stopped: boolean
  }>
  stops: { stopRuach?: boolean; stopXena?: boolean; stopSuperbot?: boolean; stopAll?: boolean }
  commands: Array<{ fighterName: string; strategy: string; threatType: string; status: string; createdAt: string }>
}

type WebsiteHealthSnapshot = {
  domain: string
  capturedAt: string
  cloudflare:
    | { available: true; metrics: { requests24h: number; bytes24h: number; threatRequests24h: number; blockedOrChallenged60s: number; blocked60s: number; challenged60s: number; threshold: number; thresholdMet: boolean } }
    | { available: false; reason: string }
  site: { ok: boolean; statusCode: number | null; latencyMs: number | null }
  activeIncident: { detectedAt: string; blockedCount: number } | null
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Live reports are unavailable or this session has expired.')
  return response.json() as Promise<T>
}

const topicLabels: Record<StreamTopic, string> = {
  all: 'All live data',
  website: 'Website & audience',
  health: 'Health & listening',
  safety: 'Safety & listening',
  security: 'Security signals',
  clarity: 'Clarity & freshness',
}

const militaryClockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Chicago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatWebsiteSnapshot(health: WebsiteHealthSnapshot, browser: BrowserHints | null) {
  const lines = [
    `WEBSITE & AUDIENCE · ${health.domain}`,
    `Checked: ${formatCentralDateTime(health.capturedAt)}`,
    `Website check: ${health.site.ok ? 'PASS' : 'FAIL'} · HTTP ${health.site.statusCode ?? 'no response'} · ${health.site.latencyMs === null ? 'latency unavailable' : `${health.site.latencyMs} ms`}`,
  ]
  if (health.cloudflare.available) {
    const metrics = health.cloudflare.metrics
    lines.push(
      'Cloudflare check: PASS',
      `Cloudflare requests · 24h: ${metrics.requests24h.toLocaleString()}`,
      `Threat requests · 24h: ${metrics.threatRequests24h.toLocaleString()}`,
      `Blocked / challenged · 60s: ${metrics.blocked60s.toLocaleString()} / ${metrics.challenged60s.toLocaleString()} (alert threshold ${metrics.threshold})`,
      `Data transfer · 24h: ${formatBytes(metrics.bytes24h)}`,
    )
  } else {
    lines.push('Cloudflare check: FAIL · live totals were not returned.')
  }
  lines.push(
    `Computer connection: ${browser ? browser.online ? 'browser reports online' : 'browser reports offline' : 'not available'}`,
    `Connection hint: ${browser?.connectionType ?? 'not provided'}${browser?.estimatedRttMs === null || !browser ? '' : ` · estimated ${browser.estimatedRttMs} ms RTT`}`,
    'Audience privacy: only aggregate requests are shown; no visitor identities or browsing histories are included in this operator snapshot.',
  )
  return lines.join('\n')
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}

function formatSnapshot(snapshot: ConsoleSnapshot | null, topic: StreamTopic, website?: WebsiteHealthSnapshot, browser: BrowserHints | null = null) {
  const observedAt = snapshot?.observedAt ?? website?.capturedAt ?? new Date().toISOString()
  const lines = [
    `LIVE DATA · ${topicLabels[topic].toUpperCase()}`,
    `Domain: ${snapshot?.domain ?? website?.domain ?? 'Configured website'}`,
    `Observed: ${formatCentralDateTime(observedAt)}`,
  ]

  if (topic === 'all' || topic === 'website') {
    lines.push('', website ? formatWebsiteSnapshot(website, browser) : 'Website and Cloudflare data are not available yet.')
  }

  if (snapshot && topic !== 'website') {
    lines.push(
      '',
      `Authenticated reports · 24h: ${snapshot.telemetryCount24h}`,
      `MM listener health: ${snapshot.systemHealth}`,
      snapshot.activeAttack
        ? `Attack report: ${snapshot.activeAttack.reportCount} reports from ${snapshot.activeAttack.sourceCount} sources · expires ${formatCentralDateTime(snapshot.activeAttack.expiresAt)}`
        : 'Attack report: none active in the last 60 seconds.',
    )

    if (snapshot.activeAttack) {
      for (const report of snapshot.activeAttack.reports) {
        const classification = [report.category, report.vector, report.signature].filter(Boolean).join(' · ') || 'unclassified'
        lines.push(`${report.fighterName} · ${classification} · ${formatCentralDateTime(report.receivedAt)} · ${report.healthPercent}% · ${report.hitsTaken}/${report.hitCapacity} hits`)
      }
    }

    if (topic === 'all' || topic === 'health') {
      lines.push('', '[HEALTH & LISTENING]')
      for (const fighter of snapshot.fighters) {
        const health = fighter.health === null ? 'no verified health' : `${fighter.health}% health`
        const hits = fighter.hitsTaken === null || fighter.hitCapacity === null ? 'hits unavailable' : `${fighter.hitsTaken}/${fighter.hitCapacity} hits`
        lines.push(`${fighter.name} · ${health} · ${hits} · inbox ${fighter.listenerStatus}`)
      }
    }

    if (topic === 'all' || topic === 'safety') {
      lines.push('', '[SAFETY]')
      lines.push(`Stops · all ${Boolean(snapshot.stops.stopAll)} · Ruach ${Boolean(snapshot.stops.stopRuach)} · Xena ${Boolean(snapshot.stops.stopXena)} · SuperBot ${Boolean(snapshot.stops.stopSuperbot)}`)
      for (const fighter of snapshot.fighters) lines.push(`${fighter.name} · inbox ${fighter.listenerStatus} · execution ${fighter.stopped ? 'stopped' : 'running'}`)
    }

    if (topic === 'all' || topic === 'security') {
      lines.push('', '[SECURITY SIGNALS]')
      for (const fighter of snapshot.fighters) lines.push(`${fighter.name} · ${fighter.signal ? `${fighter.signal.label} (${fighter.signal.confidence})` : 'no recent signal'}`)
      lines.push(`Firewall / WAF · ${snapshot.wafStatus}`)
    }

    if (topic === 'all' || topic === 'clarity') {
      lines.push('', '[DIRECTIVES]')
      for (const command of snapshot.commands) lines.push(`${command.fighterName} · ${command.threatType.replace(/_/g, ' ')} · ${command.strategy.replace(/_/g, ' ')} · ${command.status} · ${formatCentralDateTime(command.createdAt)}`)
      lines.push(`Heuristic signals are pattern hints, not confirmed incidents. Directives returned: ${snapshot.commands.length}.`)
    }
  }

  return lines.join('\n')
}

export function PlatformConsole({ onOpenSecurityView }: { onOpenSecurityView: () => void }) {
  const [topic, setTopic] = useState<StreamTopic>('all')
  const [records, setRecords] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [clockNow, setClockNow] = useState<Date | null>(null)
  const [secondsTransition, setSecondsTransition] = useState<{ current: string; previous: string | null }>({ current: '', previous: null })
  const [browserHints, setBrowserHints] = useState<BrowserHints | null>(null)
  const lastRecordedAt = useRef<string | null>(null)
  const { data: archiveData, error: archiveError, mutate: mutateArchive } = useSWR<ActivityArchiveResponse>('/api/activity-archive', fetchActivityArchive, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })
  const { data, error, isLoading, mutate } = useSWR<ConsoleSnapshot>('/api/operations', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    dedupingInterval: 1000,
  })
  const { data: website, error: websiteError, isLoading: websiteLoading, mutate: refreshWebsite } = useSWR<WebsiteHealthSnapshot>('/api/security/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  const snapshotIsFresh = data ? Date.now() - new Date(data.observedAt).getTime() <= 32_000 : false
  const websiteIsFresh = website ? Date.now() - new Date(website.capturedAt).getTime() <= 90_000 : false
  const liveKey = topic === 'website'
    ? website?.capturedAt ?? ''
    : topic === 'all'
      ? `${data?.observedAt ?? ''}:${website?.capturedAt ?? ''}`
      : data?.observedAt ?? ''
  const recordReady = topic === 'website' ? Boolean(website) : Boolean(data)
  const canCapture = topic === 'website' ? websiteIsFresh : snapshotIsFresh
  const cloudflareMetrics = website?.cloudflare.available ? website.cloudflare.metrics : null
  const clockText = clockNow ? militaryClockFormat.format(clockNow) : '--:--:--'
  const isClockReady = clockNow !== null

  async function saveSnapshot(topicToSave: StreamTopic, text: string) {
    try {
      await saveActivityArchive({ kind: 'snapshot', topic: topicToSave, text: text.slice(0, 20_000) })
      void mutateArchive()
      setNotice(`Captured ${topicLabels[topicToSave]} and saved it to your private archive.`)
    } catch {
      setNotice('Snapshot captured in this tab, but the private archive could not be reached.')
    }
  }

  function changeTopic(nextTopic: StreamTopic) {
    setTopic(nextTopic)
    setNotice('')
    void saveActivityArchive({ kind: 'topic_selected', topic: nextTopic })
      .then(() => { void mutateArchive() })
      .catch(() => setNotice('Filter changed for this session, but the private archive could not be reached.'))
  }

  useEffect(() => {
    const tick = () => setClockNow(new Date())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const nextSecond = clockText.slice(-2)
    if (!/^\\d{2}$/.test(nextSecond)) return

    setSecondsTransition((current) => current.current === nextSecond
      ? current
      : { current: nextSecond, previous: current.current || null })
    const timeout = window.setTimeout(() => {
      setSecondsTransition((current) => current.current === nextSecond ? { ...current, previous: null } : current)
    }, 920)
    return () => window.clearTimeout(timeout)
  }, [clockText])

  useEffect(() => {
    const updateBrowser = () => setBrowserHints(readBrowserHints())
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection
    updateBrowser()
    const timer = window.setInterval(updateBrowser, 5000)
    window.addEventListener('online', updateBrowser)
    window.addEventListener('offline', updateBrowser)
    document.addEventListener('visibilitychange', updateBrowser)
    connection?.addEventListener('change', updateBrowser)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', updateBrowser)
      window.removeEventListener('offline', updateBrowser)
      document.removeEventListener('visibilitychange', updateBrowser)
      connection?.removeEventListener('change', updateBrowser)
    }
  }, [])

  useEffect(() => {
    if (!isRecording || !recordReady || !liveKey || lastRecordedAt.current === liveKey) return
    if (topic === 'website' && !websiteIsFresh) return
    if (topic !== 'website' && !snapshotIsFresh) return
    lastRecordedAt.current = liveKey
    const text = topic === 'website'
      ? formatWebsiteSnapshot(website!, browserHints)
      : formatSnapshot(data ?? null, topic, website, browserHints)
    setRecords((current) => [text, ...current].slice(0, 30))
    void saveSnapshot(topic, text)
  }, [browserHints, data, isRecording, liveKey, recordReady, snapshotIsFresh, topic, website, websiteIsFresh])

  function toggleRecording() {
    setNotice('')
    setIsRecording((current) => !current)
    if (!isRecording) {
      void mutate()
      void refreshWebsite()
    } else {
      setNotice('Live stream paused.')
    }
  }

  function clearRecords() {
    setRecords([])
    lastRecordedAt.current = liveKey || null
    setNotice('Current-tab records cleared. Saved R2 records remain until deleted from Intel & activity.')
  }

  function captureCurrentSnapshot() {
    if (!canCapture) return
    const text = topic === 'website'
      ? formatWebsiteSnapshot(website!, browserHints)
      : formatSnapshot(data ?? null, topic, website, browserHints)
    setRecords((current) => [text, ...current].slice(0, 30))
    lastRecordedAt.current = liveKey
    void saveSnapshot(topic, text)
  }

  async function copyCurrentData() {
    if (!canCapture) return
    const text = topic === 'website'
      ? formatWebsiteSnapshot(website!, browserHints)
      : formatSnapshot(data ?? null, topic, website, browserHints)
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`${topicLabels[topic]} copied for sharing.`)
    } catch {
      setNotice('Clipboard unavailable. Capture the snapshot to the viewer to copy it there.')
    }
  }

  return (
    <section className="panel platform-console" aria-labelledby="console-heading">
      <div className="panel-heading console-main-heading">
        <div><p className="section-kicker">LIVE WEBSITE · CLOUDflare · DEVICE</p><h2 id="console-heading">Website &amp; computer health</h2></div>
        <div className="console-topbar-tools">
          <div className="live-clock-block">
            <span className="live-clock-label">CENTRAL · 24H</span>
            <time className="live-clock" role="timer" aria-label={isClockReady ? `Central time, 24-hour clock: ${clockText}` : 'Central time, 24-hour clock loading'} dateTime={clockNow?.toISOString()}>
              <span>{clockText.slice(0, 6)}</span><span className="live-clock-seconds-stack" aria-hidden="true">
                {secondsTransition.previous && <span key={`previous-${secondsTransition.current}`} className="live-clock-second is-fading-out">{secondsTransition.previous}</span>}
                <span key={`current-${secondsTransition.current || clockText.slice(-2)}`} className="live-clock-second is-fading-in">{secondsTransition.current || clockText.slice(-2)}</span>
              </span>
            </time>
          </div>
          <span className="console-refresh">Page 5s · Cloudflare 30s</span>
        </div>
      </div>
      <div className="console-columns">
        <div className="console-recorder">
          <div className="console-status-row">
            <span className={`console-live-status${error || (data && !snapshotIsFresh) ? ' is-unavailable' : !data ? ' is-waiting' : ''}`} role="status">
              <span className="console-live-indicator" aria-hidden="true" />
              {error ? 'Page reports unavailable' : !snapshotIsFresh ? 'Connecting to page reports' : 'Page reports live'}
            </span>
            <span className={`console-live-status ${website && websiteIsFresh && website.cloudflare.available && !websiteError ? 'is-pass' : 'is-fail'}`} role="status" aria-label={`Cloudflare check ${website && websiteIsFresh && website.cloudflare.available && !websiteError ? 'PASS' : 'FAIL'}`}>
              <span className="console-live-indicator" aria-hidden="true" />
              Cloudflare {website && websiteIsFresh && website.cloudflare.available && !websiteError ? 'PASS' : 'FAIL'}
            </span>
            <button className="text-button security-view-link" type="button" onClick={onOpenSecurityView}>Full security view</button>
          </div>

          <section className="website-data-panel" aria-labelledby="website-data-heading" aria-live="polite">
            <div className="website-data-heading">
              <div><h3 id="website-data-heading">Live site &amp; audience data</h3><span>{website ? `Updated ${formatCentralTime(website.capturedAt)}` : 'Waiting for live data'}</span></div>
            </div>
            {websiteError ? <p className="website-data-message is-unavailable" role="alert">Could not reach the live security feed. No sample data is shown.</p> : !website ? <p className="website-data-message" role="status">Connecting to the site and Cloudflare over HTTPS…</p> : (
              <div className="website-metrics-grid">
                <article className={`website-metric${website.site.ok ? ' is-good' : ' is-bad'}`}><span>Website HTTP check</span><strong>{website.site.ok ? 'PASS' : 'FAIL'}</strong><small>{website.site.statusCode === null ? 'No HTTP status received' : `HTTP ${website.site.statusCode} · HTTPS HEAD`}</small></article>
                <article className={`website-metric${website.site.ok ? ' is-good' : ' is-bad'}`}><span>Response time</span><strong>{website.site.latencyMs === null ? '—' : `${website.site.latencyMs} ms`}</strong><small>Fast &lt;500 ms · Typical 500–2,000 ms · Slow &gt;2,000 ms</small></article>
                <article className="website-metric"><span>Cloudflare requests · 24h</span><strong>{cloudflareMetrics ? cloudflareMetrics.requests24h.toLocaleString() : '—'}</strong><small>Requests, not unique viewers</small></article>
                <article className="website-metric"><span>Threat requests · 24h</span><strong>{cloudflareMetrics ? cloudflareMetrics.threatRequests24h.toLocaleString() : '—'}</strong><small>Cloudflare aggregate</small></article>
                <article className="website-metric"><span>Blocked / challenged · 60s</span><strong>{cloudflareMetrics ? `${cloudflareMetrics.blocked60s.toLocaleString()} / ${cloudflareMetrics.challenged60s.toLocaleString()}` : '—'}</strong><small>{cloudflareMetrics ? `Alert threshold ${cloudflareMetrics.threshold}` : 'Snapshot not returned'}</small></article>
                <article className="website-metric"><span>Data transfer · 24h</span><strong>{cloudflareMetrics ? formatBytes(cloudflareMetrics.bytes24h) : '—'}</strong><small>Aggregate response bytes</small></article>
                <article className={`website-metric${browserHints?.online === false ? ' is-bad' : ' is-good'}`}><span>This computer</span><strong>{browserHints ? browserHints.online ? 'Browser online' : 'Browser offline' : 'Checking'}</strong><small>{browserHints?.connectionType ?? 'Connection hint unavailable'}{browserHints?.estimatedRttMs === null || !browserHints ? '' : ` · ~${browserHints.estimatedRttMs} ms RTT`}</small></article>
                <article className="website-metric"><span>Device estimate</span><strong>{browserHints?.processorCount ? `${browserHints.processorCount} cores` : 'Unavailable'}</strong><small>{browserHints?.approximateMemoryGb ? `~${browserHints.approximateMemoryGb} GB memory` : 'Memory hint unavailable'}</small></article>
                <article className="website-metric website-privacy-metric"><span>Viewer privacy</span><strong>No individual viewer recording</strong><small>Aggregate requests only; no identities, page actions, or browsing history.</small></article>
              </div>
            )}
            <p className="website-data-footnote">Site check: the server sends an HTTPS HEAD request with an 8-second timeout and no page-body download. HTTP 2xx/3xx responses are marked responding; redirects are not followed. HTTP 4xx/5xx responses are server errors; no HTTP status means the request failed or timed out. Response time measures the server-to-response-headers round trip; it does not test browser rendering, page assets, sign-in, or app features. The browser exposes rough device hints, not a full computer diagnostic. Cloudflare request totals are aggregates and do not identify individual viewers.</p>
          </section>

          <div className="console-controls">
            <label className="sr-only" htmlFor="stream-topic">Choose a live data stream</label>
            <select id="stream-topic" value={topic} onChange={(event) => changeTopic(event.target.value as StreamTopic)}>
              {(Object.entries(topicLabels) as [StreamTopic, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="button button-primary live-capture-button" type="button" onClick={toggleRecording} disabled={topic === 'website' ? websiteLoading && !website : isLoading && !data}>
              {isRecording ? 'Pause snapshot recording' : 'Record health snapshots'}
            </button>
          </div>
          <p className="archive-inline-note" role="status">{archiveError ? 'Private archive unavailable · captures stay in this tab.' : `Private R2 archive · ${archiveData?.total ?? '…'} of 200 records. Filter choices and captured snapshots are saved to your account; snapshots include coarse connection hints, not visitor identities or browsing history.`}</p>

          <section className={`attack-report${data?.activeAttack ? ' is-active' : ''}`} aria-labelledby="attack-report-heading" aria-live="polite">
            <div className="attack-report-heading">
              <h3 id="attack-report-heading">Live attack reports</h3>
              <span>{data ? `Updated ${formatCentralTime(data.observedAt)}` : 'Waiting'}</span>
            </div>
            <p className="attack-report-explainer">The gate needs a guardian-authenticated <code>hit</code> sent to <code>/api/telemetry</code> with this site&apos;s exact scope. A listener heartbeat only proves the listener is alive; it does not count as an attack report. Reports expire after 60 seconds, so a new valid hit is needed to enable report-gated actions.</p>
            {error && (!data || !snapshotIsFresh) ? (
              <p className="attack-report-state is-unavailable" role="alert">Page reports unavailable{data ? ` · last update ${formatCentralTime(data.observedAt)}` : ''}.</p>
            ) : !data || !snapshotIsFresh ? (
              <p className="attack-report-state" role="status">Waiting for fresh page reports.</p>
            ) : data.activeAttack ? (
              <>
                <p className="attack-report-state is-active" role="status">{data.activeAttack.reportCount} authenticated report{data.activeAttack.reportCount === 1 ? '' : 's'} · {data.activeAttack.sourceCount} sources · expires {formatCentralTime(data.activeAttack.expiresAt)}</p>
                <dl className="attack-report-facts">
                  <div><dt>Assessment</dt><dd>{data.activeAttack.confidence.replace(/_/g, ' ')}</dd></div>
                  <div><dt>Evidence</dt><dd>{data.activeAttack.evidence.replace(/_/g, ' ')}</dd></div>
                  <div><dt>Correlation</dt><dd>{data.activeAttack.correlated ? 'Matched' : 'Single source'}</dd></div>
                  <div><dt>Scope / window</dt><dd>{data.activeAttack.siteScope} · {data.activeAttack.windowMs / 1000}s</dd></div>
                </dl>
                <ul className="attack-report-list" aria-label="Authenticated attack telemetry reports">
                  {data.activeAttack.reports.map((report) => (
                    <li key={`${report.fighterId}-${report.receivedAt}`}>
                      <strong>{report.fighterName}</strong>
                      <span>{[report.category, report.vector, report.signature].filter(Boolean).join(' · ') || 'Unclassified'}</span>
                      <time dateTime={report.receivedAt}>{formatCentralTime(report.receivedAt)}</time>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="attack-report-state" role="status">No authenticated hit reports in the last 60 seconds. Website traffic totals above come from Cloudflare.</p>
            )}
            <div className="attack-report-actions" aria-label="Capture or share current data">
              <button className="button button-primary live-capture-button" type="button" onClick={captureCurrentSnapshot} disabled={!canCapture}>Capture snapshot</button>
              <button className="button button-primary live-capture-button" type="button" onClick={copyCurrentData} disabled={!canCapture}>Copy data to share</button>
            </div>
          </section>

          <div className="console-record-actions">
            <span className="console-stream-state" role="status">{isRecording ? `Streaming · ${topicLabels[topic]}` : 'Viewer · ready'}</span>
            <button className="text-button console-clear" type="button" onClick={clearRecords} disabled={records.length === 0}>Clear</button>
          </div>
          <label className="sr-only" htmlFor="text-records">Captured live data records</label>
          <textarea id="text-records" className="text-records" readOnly value={records.join('\n\n────────────────────────\n\n')} placeholder="Captured live data appears here." />
          <p className="action-feedback" role="status" aria-live="polite">{notice}</p>
        </div>
      </div>
    </section>
  )
}
