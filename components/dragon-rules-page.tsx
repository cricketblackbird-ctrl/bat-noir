'use client'

import { ArrowLeft, CircleAlert, Clock3, Plus, ShieldCheck } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'
import useSWR from 'swr'
import { appendRule } from '@/app/actions/rules'
import { authClient } from '@/lib/auth-client'

type SupportKind = 'update' | 'repair' | 'source' | 'support'
type RulesSnapshot = {
  rules: { revision: number; rules: string[]; createdAt: string; cooperativeAssignment: boolean; groundRuach: boolean; groundXena: boolean } | null
  reports: Array<{
    id: string
    name: string
    status: 'reporting' | 'stale' | 'awaiting'
    detail: string | null
    health: number | null
    reportedAt: string | null
    requestType: SupportKind | null
    request: string | null
  }>
}

const fetcher = async (url: string): Promise<RulesSnapshot> => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not load current rules and reports.')
  const operations = await response.json()
  return { rules: operations.rules ?? null, reports: operations.reports ?? [] }
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No authenticated report yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function DragonRulesPage({ operator }: { operator: { name: string; isMm: boolean } }) {
  const { data, error, mutate } = useSWR<RulesSnapshot>('/api/operations', fetcher, { refreshInterval: 5000, revalidateOnFocus: true })
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isPending, startTransition] = useTransition()
  const rules = data?.rules?.rules ?? []

  function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    startTransition(async () => {
      try {
        await appendRule({ rule: draft })
        setDraft('')
        setFeedback('New version saved. Earlier revisions remain in the database history.')
        await mutate()
      } catch (cause) {
        setFeedback(cause instanceof Error ? cause.message : 'The rule could not be saved.')
      }
    })
  }

  return (
    <main className="command-page rules-command-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mm-mark" aria-hidden="true">MM</span><h1 className="brand-name">MASTER CONTROL</h1></div>
        <div className="topbar-right"><a className="website-destination-link" href="/">Dashboard</a><button className="signout-button" type="button" onClick={() => authClient.signOut().then(() => window.location.assign('/'))}>Sign out</button></div>
      </header>

      <div className="rules-page-shell">
        <a className="rules-back-link" href="/"><ArrowLeft aria-hidden="true" />Dashboard</a>
        <section className="rules-intro" aria-labelledby="rules-title">
          <p className="section-kicker">MM · VERSIONED POLICY</p>
          <h2 id="rules-title">Rules &amp; reports</h2>
          <p>One durable, append-only rules history for <strong>montemader.com</strong>. Add a rule to create a new revision; older versions stay available in Neon.</p>
          <div className="rules-meta"><span><ShieldCheck aria-hidden="true" /> {operator.isMm ? 'MM can add rules' : 'Read-only account'}</span><span>{data?.rules ? `Revision ${data.rules.revision}` : 'Loading saved revision…'}</span></div>
          {data?.rules && <div className="rules-policy-flags" aria-label="Saved assignment policy"><span>Cooperation {data.rules.cooperativeAssignment ? 'on' : 'off'}</span><span>Ruach {data.rules.groundRuach ? 'grounded' : 'not grounded'}</span><span>Xena {data.rules.groundXena ? 'grounded' : 'not grounded'}</span></div>}
        </section>

        <section className="rules-section" aria-labelledby="report-title">
          <div className="rules-section-heading"><div><p className="section-kicker">AUTHENTICATED · REFRESHES EVERY 5 SECONDS</p><h3 id="report-title">Team status &amp; requests</h3></div><span className="rules-live-label"><span aria-hidden="true" />Live</span></div>
          <p className="rules-caveat">These are the latest signed telemetry reports—not a command to the bots. A missing or stale report is shown as unconfirmed, never guessed.</p>
          {error ? <p className="rules-error" role="alert">Reports are temporarily unavailable. No status has been inferred.</p> : <div className="rules-report-grid">
            {(data?.reports ?? ['ruach', 'xena', 'superbot'].map((id) => ({ id, name: id === 'ruach' ? 'Ruach' : id === 'xena' ? 'Xena' : 'SuperBot', status: 'awaiting' as const, detail: null, health: null, reportedAt: null, requestType: null, request: null }))).map((report) => (
              <article className="rules-report-card" key={report.id}>
                <div className="rules-report-top"><h4>{report.name}</h4><span className={`rules-report-status is-${report.status}`}><span aria-hidden="true" />{report.status === 'reporting' ? 'Reporting' : report.status === 'stale' ? 'Stale' : 'Awaiting report'}</span></div>
                <p className="rules-report-detail">{report.detail ?? 'No authenticated status received.'}{report.health !== null ? ` · ${report.health}% health` : ''}</p>
                <time className="rules-report-time" dateTime={report.reportedAt ?? undefined}>{formatTimestamp(report.reportedAt)}</time>
                <div className="rules-request"><span>{report.requestType ? `Needs ${report.requestType}` : 'No request in latest report'}</span><p>{report.request ?? 'When needed, include a concise update, repair, source, or support request in authenticated telemetry.'}</p></div>
              </article>
            ))}
          </div>}
        </section>

        <section className="rules-section" aria-labelledby="saved-rules-title">
          <div className="rules-section-heading"><div><p className="section-kicker">SAVED IN THE APP DATABASE</p><h3 id="saved-rules-title">Current rules</h3></div>{data?.rules && <span className="rules-revision">Revision {data.rules.revision}</span>}</div>
          {error ? <p className="rules-error" role="alert">The saved rule revision could not be loaded.</p> : <ol className="saved-rules-list">{rules.map((rule, index) => <li key={`${data?.rules?.revision ?? 0}-${index}`}><span className="saved-rule-index">{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></li>)}</ol>}
          {data?.rules && <p className="rules-updated">Last saved {formatTimestamp(data.rules.createdAt)}</p>}
          {operator.isMm ? <form className="add-rule-form" onSubmit={addRule}>
            <label htmlFor="new-rule">Add a rule</label>
            <textarea id="new-rule" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} rows={3} placeholder="Write one clear policy. Saving creates a new immutable revision." required aria-describedby="rule-length" />
            <div className="rules-form-footer"><span id="rule-length">{draft.length}/500 characters · 40 rules max</span><button className="button button-primary" type="submit" disabled={isPending || !draft.trim() || rules.length >= 40}><Plus aria-hidden="true" />{isPending ? 'Saving…' : 'Save new revision'}</button></div>
            {feedback && <p className="rules-feedback" role="status">{feedback}</p>}
          </form> : <p className="rules-readonly-note">Only the authorized MM operator can add rules. This account can review all saved revisions.</p>}
        </section>

        <aside className="rules-safety-note"><CircleAlert aria-hidden="true" /><p><strong>Safety boundary:</strong> human takeover is independent for each bot. Ruach and Xena are limited to verified, site-scoped defensive mitigation; SuperBot can never strike. Outage recovery means safe monitoring, authorized backup, and human escalation—not irreversible or third-party action.</p></aside>
        <p className="rules-page-footnote"><Clock3 aria-hidden="true" />{operator.name} · Rules and telemetry are scoped to this site. A saved policy records intent; it does not override the authenticated bot runtime or emergency stops.</p>
      </div>
    </main>
  )
}
