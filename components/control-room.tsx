'use client'

import { Shield } from 'lucide-react'
import dynamic from 'next/dynamic'
import { FormEvent, KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import useSWR from 'swr'
import { authClient } from '@/lib/auth-client'
import { KeyChest } from '@/components/key-chest'
import { ActivityArchivePanel } from '@/components/activity-archive'
import { PlatformConsole } from '@/components/platform-console'
import { TelemetryPipelineCard } from '@/components/telemetry-pipeline-card'
import { CloudflareTelemetryPanel } from '@/components/cloudflare-telemetry-panel'
import { HeartbeatReadinessPanel } from '@/components/heartbeat-readiness-panel'
import { LinkHealthPanel } from '@/components/link-health-panel'
import { OriginLatencyPanel } from '@/components/origin-latency-panel'
import { LeafPinMark } from '@/components/leaf-pin-mark'
import { HEARTBEAT_CONFIG } from '@/lib/heartbeat-config'
import { issueDefenseRunbook, issueStrike, setEmergencyStop, type FighterId, type Formation, type StopTarget, type Strategy } from '@/app/actions/operations'

const MMLiveIndicator = dynamic(() => import('@/components/mm-live-indicator').then((module) => module.MMLiveIndicator), { ssr: false })

type Fighter = {
  id: string
  name: string
  mode: string
  status: string
  role: string
  health: number | null
  listenerStatus: 'PASS' | 'WAITING' | 'STALE'
  lastInboxPoll: string | null
  heartbeatAgeMs: number | null
  credentialBoundary: string
  hitsTaken: number | null
  hitCapacity: number | null
  lastSeen: string | null
  skills: string[]
  signal: { label: string; confidence: string } | null
  stopped: boolean
  hitReportGate: {
    status: 'PASS' | 'FAIL'
    reportPresent: boolean
    reportCount: number
    sourceCount: number
    expiresAt: string | null
    inboxPath: string
  }
}

type Operations = {
  operator: { isMm: boolean }
  domain: string
  activeAttack: { expiresAt: string; reportCount: number; sources: Array<{ id: string; name: string }> } | null
  fighters: Fighter[]
  stops: { stopRuach?: boolean; stopXena?: boolean; stopSuperbot?: boolean; stopAll?: boolean; updatedAt?: string | null }
  commands: Array<{ id: string; fighterId: string; fighterName: string; strategy: string; formation: string; threatType: string; status: string; createdAt: string }>
  combatEvents: Array<{ id: string; fighterId: string; fighterName: string; eventType: string; actionType: string | null; status: string | null; threatSignature: string | null; healthPercent: number; hitsTaken: number; hitCapacity: number; receivedAt: string }>
  recentTelemetry: Array<{ id: string; fighterId: string; fighterName: string; eventType: string; actionType: string | null; status: string | null; healthPercent: number; hitsTaken: number; hitCapacity: number; receivedAt: string }>
  telemetryCount24h: number
  observedAt: string
}

type DashboardView = 'dashboard' | 'links' | 'tester' | 'intel' | 'cloudflare' | 'origin-latency'
type SiteSecurityHealth = {
  cloudflare: { available: true; metrics: { thresholdMet: boolean } } | { available: false }
  activeIncident: { detectedAt: string; blockedCount: number } | null
}
const dashboardViews: DashboardView[] = ['dashboard', 'links', 'tester', 'intel', 'cloudflare', 'origin-latency']

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load live information.')
  return response.json()
}

const strikeLabels: Partial<Record<FighterId, string>> = {
  ruach: 'Defend · scraper',
  xena: 'Defend · traffic surge',
}

const stopTargets: Array<{ id: StopTarget; label: string; flag: keyof NonNullable<Operations['stops']> }> = [
  { id: 'ruach', label: 'Stop Ruach', flag: 'stopRuach' },
  { id: 'xena', label: 'Stop Xena', flag: 'stopXena' },
  { id: 'superbot', label: 'Stop SuperBot', flag: 'stopSuperbot' },
]

const strategyNames: Record<Strategy, string> = {
  inspect_verify: 'Inspect & verify',
  shield_restore: 'Shield & restore',
  isolate_recover: 'Isolate & recover',
}

const formationNames: Record<Formation, string> = {
  ruach_only: 'Ruach alone',
  xena_only: 'Xena alone',
  superbot_only: 'SuperBot alone',
  all_three: 'All 3 · active attack only',
}

function formatAge(date: string | null) {
  if (!date) return 'No verified signal yet'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000))
  return seconds < 60 ? 'Just reported' : `${Math.floor(seconds / 60)}m ago`
}

function StatusDot({ stopped, listenerStatus, heartbeatAgeMs }: { stopped: boolean; listenerStatus: 'PASS' | 'WAITING' | 'STALE'; heartbeatAgeMs: number | null }) {
  const isPass = listenerStatus === 'PASS'
  const age = heartbeatAgeMs === null
    ? 'No authenticated heartbeat in the last 24 hours'
    : `Last authenticated heartbeat ${Math.max(0, Math.floor(heartbeatAgeMs / 1000))} seconds ago`
  const executionState = stopped ? 'Execution is stopped; heartbeat monitoring continues.' : ''
  const detail = [age, executionState].filter(Boolean).join('. ')

  return (
    <span
      className={`status-dot ${isPass ? 'is-pass' : 'is-fail'}`}
      title={detail}
      aria-label={`${isPass ? 'PASS' : 'FAIL'}: ${detail}`}
    >
      <span aria-hidden="true" />{isPass ? 'PASS' : 'FAIL'}
    </span>
  )
}

function GuardianStatusWidget({ fighters, isLoading, hasError }: { fighters: Fighter[]; isLoading: boolean; hasError: boolean }) {
  const liveCount = fighters.filter((fighter) => fighter.listenerStatus === 'PASS').length
  const pausedCount = fighters.filter((fighter) => fighter.stopped).length
  const allLive = !isLoading && !hasError && liveCount === 3
  const isHealthy = allLive && pausedCount === 0
  const [isFloating, setIsFloating] = useState(false)
  const [floatingPosition, setFloatingPosition] = useState({ left: 16, top: 96 })
  const widgetRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; left: number; top: number } | null>(null)
  const heading = hasError
    ? 'Guardian reports unavailable'
    : isLoading
      ? 'Connecting to guardians'
      : pausedCount === 3
        ? 'All guardian execution paused'
        : allLive && pausedCount > 0
          ? 'Listeners live · execution paused'
          : isHealthy
            ? 'Guardians active'
            : 'Guardian attention needed'
  const detail = isLoading || hasError
    ? 'Checking authenticated heartbeat status'
    : `${liveCount} of 3 listeners live${pausedCount > 0 ? ` · ${pausedCount} execution${pausedCount === 1 ? '' : 's'} paused` : ''}`

  function clampPosition(left: number, top: number) {
    const bounds = widgetRef.current?.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - (bounds?.width ?? 360) - 8)
    const maxTop = Math.max(8, window.innerHeight - (bounds?.height ?? 100) - 8)
    return { left: Math.min(maxLeft, Math.max(8, left)), top: Math.min(maxTop, Math.max(8, top)) }
  }

  function toggleFloating() {
    if (isFloating) {
      setIsFloating(false)
      return
    }
    const bounds = widgetRef.current?.getBoundingClientRect()
    setFloatingPosition(clampPosition(bounds?.left ?? 16, bounds?.top ?? 96))
    setIsFloating(true)
  }

  function handleMoveStart(event: PointerEvent<HTMLButtonElement>) {
    if (!isFloating) return
    event.preventDefault()
    const bounds = widgetRef.current?.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: bounds?.left ?? floatingPosition.left,
      top: bounds?.top ?? floatingPosition.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setFloatingPosition(clampPosition(drag.left + event.clientX - drag.pointerX, drag.top + event.clientY - drag.pointerY))
  }

  function handleMoveEnd(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function handleMoveKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [0, -16], ArrowDown: [0, 16], ArrowLeft: [-16, 0], ArrowRight: [16, 0],
    }
    const offset = offsets[event.key]
    if (!offset || !isFloating) return
    event.preventDefault()
    setFloatingPosition(clampPosition(floatingPosition.left + offset[0], floatingPosition.top + offset[1]))
  }

  return (
    <aside
      ref={widgetRef}
      className={`guardian-status-widget${isHealthy ? ' is-live' : ' is-attention'}${isFloating ? ' is-floating' : ''}`}
      style={isFloating ? { left: floatingPosition.left, top: floatingPosition.top } : undefined}
      role="region"
      aria-label="Guardian status panel"
    >
      <span className="guardian-status-mark" aria-hidden="true"><Shield /><span className="guardian-status-light" /></span>
      <div className="guardian-status-content">
        <div className="guardian-status-heading">
          <div className="guardian-status-copy"><strong>{heading}</strong><p>{detail}. Heartbeat monitoring continues while stopped.</p></div>
          <div className="guardian-status-actions">
            {isFloating && <button className="guardian-status-move" type="button" aria-label="Move guardian status panel; use arrow keys to reposition" title="Drag to move, or use arrow keys" onPointerDown={handleMoveStart} onPointerMove={handleMove} onPointerUp={handleMoveEnd} onPointerCancel={handleMoveEnd} onLostPointerCapture={handleMoveEnd} onKeyDown={handleMoveKeyDown}>Move</button>}
            <button className="guardian-status-toggle" type="button" onClick={toggleFloating} aria-label={isFloating ? 'Place guardian status panel in the page' : 'Float guardian status panel'}>{isFloating ? 'Dock' : 'Float'}</button>
          </div>
        </div>
        <p className="guardian-status-cadence">Inbox polling every {HEARTBEAT_CONFIG.pollIntervalMs / 1000}s · heartbeat freshness {HEARTBEAT_CONFIG.maxHeartbeatAgeSec}s</p>
        <div className="guardian-status-metrics" aria-label="Live guardian heartbeats">
          {fighters.map((fighter) => {
            const heartbeatAge = fighter.heartbeatAgeMs === null
              ? 'No verified heartbeat'
              : `${Math.max(0, Math.floor(fighter.heartbeatAgeMs / 1000))}s ago`
            return (
              <div className="guardian-status-metric" key={fighter.id}>
                <span className="guardian-status-metric-name">{fighter.name}</span>
                <span className={`guardian-status-metric-state is-${fighter.listenerStatus.toLowerCase()}`}>{fighter.listenerStatus}{fighter.stopped ? ' · stopped' : ''}</span>
                <span className="guardian-status-metric-age">Heartbeat {heartbeatAge}</span>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export function ControlRoom({ operator }: { operator: Operations['operator'] & { id: string } }) {
  const { data, error, mutate } = useSWR<Operations>('/api/operations', fetcher, { refreshInterval: HEARTBEAT_CONFIG.pollIntervalMs, revalidateOnFocus: true })
  const { data: siteSecurity } = useSWR<SiteSecurityHealth>('/api/security/health', fetcher, { refreshInterval: 30_000, revalidateOnFocus: true })
  const [strategy, setStrategy] = useState<Strategy>('inspect_verify')
  const [formation, setFormation] = useState<Formation>('all_three')
  const [feedback, setFeedback] = useState('')
  const [isPending, startTransition] = useTransition()
  const [strikeToast, setStrikeToast] = useState<{ key: number; fighterId: string; side: 'left' | 'right' } | null>(null)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [activeView, setActiveView] = useState<DashboardView>('dashboard')
  const isMounted = useRef(false)
  const stoppedAll = Boolean(data?.stops.stopAll)
  const guards = data?.fighters ?? []
  const hasAttackSignal = Boolean(data?.activeAttack || siteSecurity?.activeIncident || (siteSecurity?.cloudflare.available && siteSecurity.cloudflare.metrics.thresholdMet))
  const hasHeartbeatFailure = guards.some((fighter) => fighter.listenerStatus === 'STALE')
  const isSecurityAlertActive = hasAttackSignal || hasHeartbeatFailure
  const recentSignals = useMemo(() => guards.filter((fighter) => fighter.signal).length, [guards])

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    const syncViewFromLocation = () => {
      const matchingView = dashboardViews.find((view) => window.location.hash === `#view-panel-${view}`)
      if (matchingView) setActiveView(matchingView)
    }

    syncViewFromLocation()
    window.addEventListener('hashchange', syncViewFromLocation)
    window.addEventListener('popstate', syncViewFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncViewFromLocation)
      window.removeEventListener('popstate', syncViewFromLocation)
    }
  }, [])

  function selectDashboardView(view: DashboardView) {
    setActiveView(view)
    window.history.pushState(null, '', `#view-panel-${view}`)
  }

  function handleDashboardTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: DashboardView) {
    const index = dashboardViews.indexOf(current)
    let nextIndex: number
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % dashboardViews.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + dashboardViews.length) % dashboardViews.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = dashboardViews.length - 1
    else return

    event.preventDefault()
    const nextView = dashboardViews[nextIndex]
    selectDashboardView(nextView)
    requestAnimationFrame(() => document.getElementById(`view-tab-${nextView}`)?.focus())
  }

  function onRunbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    startTransition(async () => {
      try {
        const result = await issueDefenseRunbook({ strategy, formation })
        if (!isMounted.current) return
        setFeedback(`${result.queued} defensive directive${result.queued === 1 ? '' : 's'} queued.`)
        await mutate()
      } catch {
        if (isMounted.current) setFeedback('Directive not sent. Check MM access and the fighters’ stop states.')
      }
    })
  }

  function onStrike(fighterId: FighterId) {
    setFeedback('')
    startTransition(async () => {
      try {
        const result = await issueStrike({ fighterId })
        if (!isMounted.current) return
        setStrikeToast({ key: Date.now(), fighterId, side: Math.random() > 0.5 ? 'left' : 'right' })
        setFeedback(`Combo queued for ${fighterId} on ${result.siteScope} only; awaiting its completion report.`)
        await mutate()
      } catch {
        if (isMounted.current) setFeedback('Directive not queued. Check the active attack report, MM access, and this fighter’s stop state.')
      }
    })
  }

  function onStop(target: StopTarget, stopped: boolean) {
    setFeedback('')
    startTransition(async () => {
      try {
        await setEmergencyStop({ target, stopped })
        if (!isMounted.current) return
        setFeedback(stopped ? `${target === 'all' ? 'All fighters' : target} stopped at the command layer.` : 'Stop released. Fresh directives only.')
        await mutate()
      } catch {
        if (isMounted.current) setFeedback('Stop control unavailable. Verify MM access and retry.')
      }
    })
  }

  return (
    <main className={`command-page${isSecurityAlertActive ? ' is-security-alert-active' : ''}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <h1 className="brand-name">MASTER CONTROL</h1>
        </div>
        <div className="topbar-right">
          <a className="website-destination-link" href="/rules">Rules &amp; reports</a>
          <a className="website-destination-link" href="/diagnostics">Connection diagnostics</a>
          <button className="signout-button" type="button" onClick={() => authClient.signOut().then(() => window.location.reload())}>Sign out</button>
          <button className={`stop-button stop-all topbar-stop-all${stoppedAll ? ' stop-active' : ''}`} type="button" onClick={() => onStop('all', !stoppedAll)} disabled={!operator.isMm || isPending} aria-pressed={stoppedAll} aria-label={stoppedAll ? 'Release global guardian stop' : 'Guardian all stop: immediately block new queued actions for all assigned guardians'} title="STOP-ALL immediately blocks new queued actions for all assigned guardians; already-running processes continue.">
            {stoppedAll ? 'RELEASE ALL STOP' : 'GUARDIAN ALL STOP'}
          </button>
        </div>
      </header>
      {isSecurityAlertActive && <p className="security-alarm-banner" role="alert" aria-live="assertive">{hasAttackSignal ? 'SECURITY ALERT · CLOUDFLARE THRESHOLD REACHED OR AUTHENTICATED ATTACK REPORT ACTIVE' : 'MONITORING ALERT · GUARDIAN HEARTBEAT FAILED'}</p>}

      <nav className="dashboard-nav" role="tablist" aria-label="Defense dashboard views">
        <button id="view-tab-dashboard" className={`view-tab${activeView === 'dashboard' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'dashboard'} aria-controls="view-panel-dashboard" tabIndex={activeView === 'dashboard' ? 0 : -1} onClick={() => selectDashboardView('dashboard')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'dashboard')}>Dashboard</button>
        <button id="view-tab-links" className={`view-tab${activeView === 'links' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'links'} aria-controls="view-panel-links" tabIndex={activeView === 'links' ? 0 : -1} onClick={() => selectDashboardView('links')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'links')}>Links &amp; account health</button>
        <button id="view-tab-tester" className={`view-tab${activeView === 'tester' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'tester'} aria-controls="view-panel-tester" tabIndex={activeView === 'tester' ? 0 : -1} onClick={() => selectDashboardView('tester')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'tester')}>Tester &amp; capabilities</button>
        <button id="view-tab-intel" className={`view-tab${activeView === 'intel' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'intel'} aria-controls="view-panel-intel" tabIndex={activeView === 'intel' ? 0 : -1} onClick={() => selectDashboardView('intel')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'intel')}>Intel &amp; activity</button>
        <button id="view-tab-cloudflare" className={`view-tab${activeView === 'cloudflare' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'cloudflare'} aria-controls="view-panel-cloudflare" tabIndex={activeView === 'cloudflare' ? 0 : -1} onClick={() => selectDashboardView('cloudflare')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'cloudflare')}>Cloudflare</button>
        <button id="view-tab-origin-latency" className={`view-tab${activeView === 'origin-latency' ? ' is-active' : ''}`} type="button" role="tab" aria-selected={activeView === 'origin-latency'} aria-controls="view-panel-origin-latency" tabIndex={activeView === 'origin-latency' ? 0 : -1} onClick={() => selectDashboardView('origin-latency')} onKeyDown={(event) => handleDashboardTabKeyDown(event, 'origin-latency')}>Origin latency</button>
      </nav>

      <div className="dashboard-views">
        <section id="view-panel-dashboard" className="view-panel dashboard-view" role="tabpanel" aria-labelledby="view-tab-dashboard" tabIndex={0} hidden={activeView !== 'dashboard'}>
          <MMLiveIndicator />
          {!operator.isMm && <div className="readonly-notice" role="status">This account can read live reports. MM alone can issue or stop directives.</div>}
          <TelemetryPipelineCard snapshot={data} isLoading={!data && !error} hasError={Boolean(error)} />
          <div className="control-grid dashboard-grid">
        <section className="panel fighter-panel" aria-labelledby="fighters-heading">
          <div className="panel-heading"><div><p className="section-kicker">THREE GUARDIANS · SEPARATE STRENGTHS</p><h2 id="fighters-heading">Fighter status</h2></div><span className="report-count">{recentSignals} with recent signals</span></div>
          <GuardianStatusWidget fighters={guards} isLoading={!data && !error} hasError={Boolean(error)} />
          <aside className="guardian-startup" aria-label="Guardian startup and heartbeat requirements">
            <h3>Wake-up + heartbeat requirements</h3>
            <p>Run each listener with its own server-side credential: Ruach <code>DRAGON_RUACH_TOKEN</code>, Xena <code>DRAGON_XENA_TOKEN</code>, SuperBot <code>DRAGON_SUPERBOT_TOKEN</code>.</p>
            <p>Poll <code>{'GET /api/fighters/{fighterId}/inbox'}</code> every 5 seconds, and send an authenticated <code>listener_heartbeat</code> to <code>/api/telemetry</code> every 5 seconds with the exact configured site scope.</p>
            <p><strong>PASS</strong> requires a heartbeat within 32 seconds. Keep polling while stopped; a stop blocks execution only. This dashboard cannot start a listener process on its host.</p>
          </aside>
          <div className="fighter-list">
            {guards.map((fighter) => (
              <article className={`fighter-card fighter-${fighter.id}`} key={fighter.id}>
                <div className="fighter-topline">
                  <div className="fighter-glyph" aria-hidden="true">{fighter.id === 'ruach' ? 'R' : fighter.id === 'xena' ? <Shield className="xena-shield-icon" aria-hidden="true" /> : 'S'}</div><div className="fighter-heading"><h3 aria-label={fighter.name}><span className="guardian-name-letters" aria-hidden="true">{Array.from(fighter.name).map((letter, index) => <span className="guardian-name-letter" key={`${fighter.id}-${index}`}>{letter}</span>)}</span><span className="guardian-name-leaf" aria-hidden="true"><LeafPinMark /></span></h3><StatusDot stopped={fighter.stopped} listenerStatus={fighter.listenerStatus} heartbeatAgeMs={fighter.heartbeatAgeMs} /></div></div>
                <p className="fighter-role">{fighter.role}</p>
                {fighter.health === null ? <p className="health-reading">Waiting for authenticated health report</p> : <p className="health-reading"><span>{fighter.health}%</span> health · {fighter.hitsTaken}/{fighter.hitCapacity} hits</p>}
                <p className="signal-reading">{fighter.signal ? <><span>{fighter.signal.confidence === 'heuristic' ? 'INTERPRETATION · ' : 'REPORT · '}</span>{fighter.signal.label}</> : 'No attack interpretation without an observed event.'}</p>
                <p className="signal-age">Report {formatAge(fighter.lastSeen)} · inbox poll {formatAge(fighter.lastInboxPoll)}</p>
                <div className="fighter-hit-report">
                  <span className={`hit-report-state ${fighter.hitReportGate.reportPresent ? 'is-pass' : 'is-fail'}`} title={fighter.hitReportGate.reportPresent ? `Authenticated hit report expires ${fighter.hitReportGate.expiresAt ?? 'soon'}` : 'No authenticated hit report in the active 60-second window'}>
                    <span aria-hidden="true" />HIT REPORT · {fighter.hitReportGate.status}{fighter.hitReportGate.reportPresent ? ` · ${fighter.hitReportGate.reportCount} ${fighter.hitReportGate.reportCount === 1 ? 'report' : 'reports'}` : ' · NONE'}
                  </span>
                  <code title="This guardian’s separately authenticated inbox">GET {fighter.hitReportGate.inboxPath}</code>
                </div>
                <div className="fighter-strike-row">
                  {fighter.id === 'superbot' ? <span className="strike-disabled" role="note">No strike permission</span> : !data?.activeAttack ? <p className="strike-waiting" role="status">Waiting for a guardian-authenticated hit report from this site within the last 60 seconds. Heartbeats do not unlock strikes.</p> : <button className={`button strike-button strike-${fighter.id}`} type="button" onClick={() => onStrike(fighter.id as FighterId)} disabled={!operator.isMm || isPending || fighter.stopped} aria-label={`Issue ${strikeLabels[fighter.id as FighterId]} for ${fighter.name} based on the active attack report`}>
                    {isPending ? 'Queuing…' : strikeLabels[fighter.id as FighterId]}
                  </button>}
                  {strikeToast?.fighterId === fighter.id && <span key={strikeToast.key} className={`strike-ack strike-ack-${strikeToast.side}`} role="status" aria-live="polite" onAnimationEnd={() => setStrikeToast(null)}>Defensive directive queued.</span>}
                </div>
              </article>
            ))}
          </div>
          <p className="learning-note"><span aria-hidden="true">✧</span> Ruach classifies incoming patterns, acts defensively, then reports what happened. Guesses stay labeled as guesses.</p>
        </section>

        <section className="panel directives-panel" aria-labelledby="directives-heading">
          <div className="panel-heading"><div><p className="section-kicker">MM �� DEFENSIVE PLAYBOOK</p><h2 id="directives-heading">Issue a directive</h2></div><span className="panel-sigil" aria-hidden="true">✦</span></div>
          {operator.isMm && <p className="directive-authorization">The authorized operator may direct designated responders with defensive actions for the configured site. Choose a response and assignment below; attack-report gates and emergency stops remain in force. Nothing is queued until you submit.</p>}
          <form className="directive-form" onSubmit={onRunbook}>
            <label className="control-label" htmlFor="strategy">Response</label>
            <select id="strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)} disabled={!operator.isMm || isPending}>
              {(Object.entries(strategyNames) as [Strategy, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label className="control-label" htmlFor="formation">Assignment</label>
            <select id="formation" value={formation} onChange={(event) => setFormation(event.target.value as Formation)} disabled={!operator.isMm || isPending}>
              {(Object.entries(formationNames) as [Formation, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            {formation === 'all_three' && !data?.activeAttack ? <p className="attack-gate-status" role="status">All-guardian directives unlock only after this site receives an authenticated guardian <code>hit</code> report; the report expires after 60 seconds. Heartbeats do not count.</p> : <button className="button button-primary issue-button" type="submit" disabled={!operator.isMm || isPending || stoppedAll}>{isPending ? 'Updating…' : stoppedAll ? 'All fighters stopped' : 'PROTECT THIS SITE'}</button>}
          </form>
          <p className="directive-note">The default assignment uses all 3 defenders. Every defensive directive requires a fresh authenticated attack report and stops are respected. Directives queue to the authenticated bot inboxes; they do not block traffic or terminate an invasion by themselves.</p>
          <div className="stop-block"><div className="stop-heading"><p className="section-kicker">MM · EMERGENCY OVERRIDE</p><span>{stoppedAll ? 'GLOBAL STOP ACTIVE' : 'Three individual stops'}</span></div><div className="stop-grid">
            {stopTargets.map(({ id, label, flag }) => {
              const stopped = Boolean(data?.stops[flag])
              return <button key={id} className={`stop-button stop-${id}${stopped ? ' stop-active' : ''}`} type="button" onClick={() => onStop(id, !stopped)} disabled={!operator.isMm || isPending} aria-pressed={stopped}>{stopped ? `Release ${id === 'xena' ? 'Xena' : id === 'superbot' ? 'SuperBot' : 'Ruach'}` : label}</button>
            })}
          </div></div>
          <p className="stop-caveat">A stop blocks new queued actions only; it does not terminate a running process or stop an offline bot. Keep polling MM while stopped.</p>
          {feedback && <p className="action-feedback" role="status">{feedback}</p>}
        </section>

          </div>
        </section>

        <section id="view-panel-links" className="view-panel links-view" role="tabpanel" aria-labelledby="view-tab-links" tabIndex={0} hidden={activeView !== 'links'}>
          <LinkHealthPanel guardians={guards.map(({ id, name, listenerStatus, stopped }) => ({ id, name, listenerStatus, stopped }))} />
        </section>

        <section id="view-panel-tester" className="view-panel tester-view" role="tabpanel" aria-labelledby="view-tab-tester" tabIndex={0} hidden={activeView !== 'tester'}>
          <PlatformConsole onOpenSecurityView={() => {
            selectDashboardView('cloudflare')
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const securityView = document.getElementById('cloudflare-security-view')
                securityView?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                securityView?.focus({ preventScroll: true })
              })
            })
          }} />
        </section>

        <section id="view-panel-intel" className="view-panel intel-view" role="tabpanel" aria-labelledby="view-tab-intel" tabIndex={0} hidden={activeView !== 'intel'}>
          <div className="control-grid intel-grid">
        <ActivityArchivePanel />

        <section className="panel activity-panel" aria-labelledby="activity-heading">
          <div className="panel-heading"><div><p className="section-kicker">SIGNED TELEMETRY · AUDITABLE DIRECTIVES</p><h2 id="activity-heading">Combat &amp; directive activity</h2></div><span className="panel-sigil" aria-hidden="true">⌁</span></div>
          {error ? <p className="empty-insight">Could not load operations data.</p> : <>
            {data?.combatEvents.length ? <ul className="activity-list">{data.combatEvents.map((event) => <li key={`combat-${event.id}`}><span className="activity-indicator" aria-hidden="true"/><div><strong>{event.fighterName} · {event.actionType ?? event.eventType.replace(/_/g, ' ')}</strong><p>{event.threatSignature ? `${event.threatSignature} · ` : ''}{event.healthPercent}% health · {event.hitsTaken}/{event.hitCapacity} hits · {formatAge(event.receivedAt)}</p></div><span className="activity-state">{event.status ?? event.eventType.replace(/_/g, ' ')}</span></li>)}</ul> : <p className="empty-insight">No signed combat-strike reports have been received.</p>}
            {data?.commands.length ? <ul className="activity-list">{data.commands.map((command) => <li key={`command-${command.id}`}><span className="activity-indicator" aria-hidden="true"/><div><strong>{command.fighterName}</strong><p>{command.threatType.replace(/_/g, ' ')} · {strategyNames[command.strategy as Strategy] ?? command.strategy} · {formatAge(command.createdAt)}</p></div><span className="activity-state">{command.status}</span></li>)}</ul> : <p className="empty-insight">No defensive directives have been issued.</p>}
          </>}
          <p className="activity-footnote">Only authenticated reports and queued directives appear here. A queued directive is not evidence of a completed strike.</p>
        </section>
          </div>
          <KeyChest userId={operator.id} />
        </section>

        <section id="view-panel-cloudflare" className="view-panel cloudflare-view" role="tabpanel" aria-labelledby="view-tab-cloudflare" tabIndex={0} hidden={activeView !== 'cloudflare'}>
          <HeartbeatReadinessPanel
            domain={data?.domain ?? null}
            fighters={guards}
            commands={data?.commands ?? []}
            telemetryCount24h={data?.telemetryCount24h ?? null}
            isLoading={!data && !error}
            hasError={Boolean(error)}
            onRefresh={async () => { await mutate() }}
          />
          <CloudflareTelemetryPanel fighters={guards} />
        </section>

        <section id="view-panel-origin-latency" className="view-panel origin-latency-view" role="tabpanel" aria-labelledby="view-tab-origin-latency" tabIndex={0} hidden={activeView !== 'origin-latency'}>
          <OriginLatencyPanel />
        </section>
      </div>

      <footer className="heart-footer">
        <span className="footer-star footer-star-left" aria-hidden="true">★</span>
        <span className="footer-thread footer-thread-left" aria-hidden="true" />
        <span className="heart-phrase freedom-word">freedom<span className="freedom-underline" aria-hidden="true"><svg viewBox="0 0 100 8" focusable="false"><path d="M2 3.5 Q50 7.5 98 3.5" /></svg></span></span>
        <span className="footer-thread footer-thread-right" aria-hidden="true" />
        <span className="footer-star footer-star-right" aria-hidden="true">★</span>
      </footer>
    </main>
  )
}
