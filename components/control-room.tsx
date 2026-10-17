'use client'

import { FormEvent, useMemo, useState, useTransition } from 'react'
import useSWR from 'swr'
import { authClient } from '@/lib/auth-client'
import { issueDefenseRunbook, setEmergencyStop, type Formation, type StopTarget, type Strategy } from '@/app/actions/operations'

type Fighter = {
  id: string
  name: string
  mode: string
  status: string
  health: number | null
  hitsTaken: number | null
  hitCapacity: number | null
  lastSeen: string | null
  skills: string[]
  signal: { label: string; confidence: string } | null
  stopped: boolean
}

type Operations = {
  operator: { name: string; email: string; isMm: boolean }
  fighters: Fighter[]
  stops: { stopRuach?: boolean; stopXena?: boolean; stopSuperbot?: boolean; stopAll?: boolean; updatedAt?: string | null }
  commands: Array<{ id: string; fighterId: string; fighterName: string; strategy: string; formation: string; status: string; createdAt: string }>
  telemetryCount24h: number
  observedAt: string
}

type MagicInsights = {
  available: boolean
  source: string | null
  insights: Array<{ date: string; country: string; countryCode: string; visitors: number; capturedAt: string }>
  privacy: string
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load live information.')
  return response.json()
}

const fighterCopy: Record<string, string> = {
  ruach: 'Independent read · threat interpretation',
  xena: 'Edge defense · isolated traffic',
  superbot: 'Infrastructure · shared coordination',
}

const stopTargets: Array<{ id: StopTarget; label: string; flag: keyof NonNullable<Operations['stops']> }> = [
  { id: 'ruach', label: 'Stop Ruach', flag: 'stopRuach' },
  { id: 'xena', label: 'Stop Xena', flag: 'stopXena' },
  { id: 'superbot', label: 'Stop SuperBot', flag: 'stopSuperbot' },
  { id: 'all', label: 'Stop all', flag: 'stopAll' },
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
  ruach_xena: 'Ruach + Xena',
  ruach_superbot: 'Ruach + SuperBot',
  xena_superbot: 'Xena + SuperBot',
  all_three: 'All three · coordinated',
}

function formatAge(date: string | null) {
  if (!date) return 'No verified signal yet'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000))
  return seconds < 60 ? 'Just reported' : `${Math.floor(seconds / 60)}m ago`
}

function StatusDot({ stopped, reporting }: { stopped: boolean; reporting: boolean }) {
  const label = stopped ? 'Stopped by MM' : reporting ? 'Telemetry reporting' : 'Awaiting telemetry'
  return <span className={`status-dot${stopped ? ' is-stopped' : reporting ? ' is-live' : ''}`}><span aria-hidden="true" />{label}</span>
}

export function ControlRoom({ operator }: { operator: Operations['operator'] }) {
  const { data, error, mutate } = useSWR<Operations>('/api/operations', fetcher, { refreshInterval: 5000, revalidateOnFocus: true })
  const magic = useSWR<MagicInsights>('/api/magic-dragons', fetcher, { refreshInterval: 30000, revalidateOnFocus: true })
  const [strategy, setStrategy] = useState<Strategy>('inspect_verify')
  const [formation, setFormation] = useState<Formation>('all_three')
  const [feedback, setFeedback] = useState('')
  const [isPending, startTransition] = useTransition()
  const [swordDrawn, setSwordDrawn] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const stoppedAll = Boolean(data?.stops.stopAll)
  const guards = data?.fighters ?? []
  const recentSignals = useMemo(() => guards.filter((fighter) => fighter.signal).length, [guards])

  function onRunbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    startTransition(async () => {
      try {
        const result = await issueDefenseRunbook({ strategy, formation })
        setFeedback(`${result.queued} defensive directive${result.queued === 1 ? '' : 's'} queued.`)
        await mutate()
      } catch {
        setFeedback('Directive not sent. Check MM access and the fighters’ stop states.')
      }
    })
  }

  function onStop(target: StopTarget, stopped: boolean) {
    setFeedback('')
    startTransition(async () => {
      try {
        await setEmergencyStop({ target, stopped })
        setFeedback(stopped ? `${target === 'all' ? 'All fighters' : target} stopped at the command layer.` : 'Stop released. Fresh directives only.')
        await mutate()
      } catch {
        setFeedback('Stop control unavailable. Verify MM access and retry.')
      }
    })
  }

  return (
    <main className="command-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-sigil" aria-hidden="true">✦</span><div><p className="brand-name">MONTEMADER</p><p className="brand-subtitle">DEFENSE COMMAND</p></div></div>
        <div className="topbar-right"><span className="mm-pill">{operator.isMm ? 'MM · FULL CONTROL' : 'READ ONLY'}</span><button className="signout-button" type="button" onClick={() => authClient.signOut().then(() => window.location.reload())}>Sign out</button></div>
      </header>

      <section className="welcome-strip" aria-label="Coordination doctrine">
        <div className="welcome-mark" aria-hidden="true"><span>✧</span><span>✦</span><span>✧</span></div>
        <div><h1>Stand together. Think independently.</h1><p>SuperBot coordinates; Ruach and Xena keep distinct defensive roles. Never target one another.</p></div>
        <div className="live-summary"><span className="summary-number">{data?.telemetryCount24h ?? '—'}</span><span>verified reports<br />last 24 hours</span></div>
      </section>

      {!operator.isMm && <div className="readonly-notice" role="status">This account can read live reports. MM alone can issue or stop directives.</div>}

      <div className="control-grid">
        <section className="panel fighter-panel" aria-labelledby="fighters-heading">
          <div className="panel-heading"><div><p className="section-kicker">THREE GUARDIANS · SEPARATE STRENGTHS</p><h2 id="fighters-heading">Fighter status</h2></div><span className="report-count">{recentSignals} with recent signals</span></div>
          <div className="fighter-list">
            {guards.map((fighter) => (
              <article className={`fighter-card fighter-${fighter.id}`} key={fighter.id}>
                <div className="fighter-topline"><div className="fighter-glyph" aria-hidden="true">{fighter.id === 'ruach' ? 'R' : fighter.id === 'xena' ? 'X' : 'S'}</div><div className="fighter-heading"><h3>{fighter.name}</h3><StatusDot stopped={fighter.stopped} reporting={fighter.status === 'reporting'} /></div></div>
                <p className="fighter-role">{fighterCopy[fighter.id]}</p>
                {fighter.health === null ? <p className="health-reading">Awaiting a signed report</p> : <p className="health-reading"><span>{fighter.health}%</span> health · {fighter.hitsTaken}/{fighter.hitCapacity} hits</p>}
                <p className="signal-reading">{fighter.signal ? <><span>{fighter.signal.confidence === 'heuristic' ? 'INTERPRETATION · ' : 'REPORT · '}</span>{fighter.signal.label}</> : 'No attack interpretation without an observed event.'}</p>
                <p className="signal-age">{formatAge(fighter.lastSeen)}</p>
              </article>
            ))}
          </div>
          <p className="learning-note"><span aria-hidden="true">✧</span> Ruach classifies incoming patterns, acts defensively, then reports what happened. Guesses stay labeled as guesses.</p>
        </section>

        <section className="panel directives-panel" aria-labelledby="directives-heading">
          <div className="panel-heading"><div><p className="section-kicker">MM · DEFENSIVE PLAYBOOK</p><h2 id="directives-heading">Issue a directive</h2></div><span className="panel-sigil" aria-hidden="true">✦</span></div>
          <form className="directive-form" onSubmit={onRunbook}>
            <label className="control-label" htmlFor="strategy">Response</label>
            <select id="strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)} disabled={!operator.isMm || isPending}>
              {(Object.entries(strategyNames) as [Strategy, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label className="control-label" htmlFor="formation">Assignment</label>
            <select id="formation" value={formation} onChange={(event) => setFormation(event.target.value as Formation)} disabled={!operator.isMm || isPending}>
              {(Object.entries(formationNames) as [Formation, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <button className="button button-primary issue-button" type="submit" disabled={!operator.isMm || isPending || stoppedAll}>{isPending ? 'Updating…' : stoppedAll ? 'All fighters stopped' : 'Queue defensive response'}</button>
          </form>
          <p className="directive-note">Independent assignment avoids duplicate responses. Ruach may defend alone; Xena and SuperBot are allies, never enemies.</p>
          <div className="stop-block"><div className="stop-heading"><p className="section-kicker">MM · EMERGENCY OVERRIDE</p><span>{stoppedAll ? 'GLOBAL STOP ACTIVE' : 'Four stop controls'}</span></div><div className="stop-grid">
            {stopTargets.map(({ id, label, flag }) => {
              const stopped = Boolean(data?.stops[flag])
              return <button key={id} className={`stop-button stop-${id}${stopped ? ' stop-active' : ''}`} type="button" onClick={() => onStop(id, !stopped)} disabled={!operator.isMm || isPending} aria-pressed={stopped}>{stopped ? `Release ${id === 'all' ? 'all' : id === 'xena' ? 'Xena' : id === 'superbot' ? 'SuperBot' : 'Ruach'}` : label}</button>
            })}
          </div></div>
          <p className="stop-caveat">A stop blocks queued directives at the next agent check-in; it cannot halt a disconnected process.</p>
          {feedback && <p className="action-feedback" role="status">{feedback}</p>}
        </section>

        <section className="panel magic-panel" aria-labelledby="magic-heading">
          <div className="panel-heading"><div><p className="section-kicker">SEPARATE · AGGREGATE ONLY</p><h2 id="magic-heading">Magic Dragons</h2></div><span className="panel-sigil magic-sigil" aria-hidden="true">✧</span></div>
          <p className="magic-description">A small, independent view of where visits come from—kept separate from fighter telemetry.</p>
          {magic.error ? <p className="empty-insight">Aggregate insights are unavailable right now.</p> : magic.data?.available ? <ul className="insight-list">{magic.data.insights.map((insight, index) => <li key={`${insight.date}-${insight.countryCode}-${index}`}><span className="insight-country">{insight.country}</span><span>{insight.visitors.toLocaleString()} visits</span><time dateTime={insight.date}>{insight.date}</time></li>)}</ul> : <p className="empty-insight">No Cloudflare aggregate feed is connected yet. Nothing is inferred or invented.</p>}
          <button className="privacy-toggle" type="button" aria-expanded={showPrivacy} onClick={() => setShowPrivacy((current) => !current)}>{showPrivacy ? 'Hide privacy note' : 'What this view stores'}</button>
          {showPrivacy && <p className="privacy-note">{magic.data?.privacy ?? 'Only daily, country-level totals are intended. No visitor names, IP addresses, or per-person trails.'}</p>}
          <div className="magic-boundary"><span aria-hidden="true">✦</span> Not used to decide who is an enemy.</div>
        </section>

        <section className="panel activity-panel" aria-labelledby="activity-heading">
          <div className="panel-heading"><div><p className="section-kicker">AUDITABLE · NO SIMULATED EVENTS</p><h2 id="activity-heading">Directive activity</h2></div><span className="panel-sigil" aria-hidden="true">⌁</span></div>
          {error ? <p className="empty-insight">Could not load operations data.</p> : data?.commands.length ? <ul className="activity-list">{data.commands.map((command) => <li key={command.id}><span className="activity-indicator" aria-hidden="true"/><div><strong>{command.fighterName}</strong><p>{strategyNames[command.strategy as Strategy] ?? command.strategy} · {formationNames[command.formation as Formation] ?? command.formation}</p></div><span className="activity-state">{command.status}</span></li>)}</ul> : <p className="empty-insight">No defensive directives have been issued.</p>}
          <p className="activity-footnote">Only events reported by authenticated agents appear here. This console does not claim to block traffic by itself.</p>
        </section>
      </div>

      <footer className="heart-footer">
        <span className="footer-star footer-star-left" aria-hidden="true">✧</span>
        <span className="footer-thread footer-thread-left" aria-hidden="true" />
        <button className={`heart-phrase${swordDrawn ? ' sword-drawn' : ''}`} type="button" onClick={() => setSwordDrawn((drawn) => !drawn)} aria-label={swordDrawn ? 'Freedom, crossed by a sword. Activate to restore the message.' : 'You are safe because you deserve better. But you are a fighter because you chose to be. We’ll be with you. Activate to reveal freedom.'} aria-live="polite">
          {swordDrawn ? <span className="freedom-word">freedom<span className="sword-slash" aria-hidden="true"><svg viewBox="0 0 100 20" focusable="false"><path d="M4 15 88 4m-9-1 10 1-4 8M12 12l-7 4 6 2" /></svg></span></span> : 'You are safe because you deserve better. But you are a fighter because you chose to be. We’ll be with you.'}
        </button>
        <span className="footer-thread footer-thread-right" aria-hidden="true" />
        <span className="footer-star footer-star-right" aria-hidden="true">✦</span>
      </footer>
    </main>
  )
}
