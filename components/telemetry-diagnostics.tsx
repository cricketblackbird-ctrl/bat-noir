'use client'

import { Activity, ArrowLeft, Check, CircleAlert, Clock3, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import useSWR from 'swr'

type ProbeState = 'online' | 'attention' | 'unauthorized' | 'unreachable'

type Probe = {
  id: string
  title: string
  route: string
  state: ProbeState
  httpStatus: number | null
  summary: string
  details: string[]
  checkedAt: string
}

type DiagnosticsSnapshot = {
  probes: Probe[]
  capturedAt: string
}

type EndpointPayload = {
  error?: string
  success?: boolean
  status?: number | null
  target?: string
  data?: {
    domain?: string
    capturedAt?: string
    site?: { ok?: boolean; statusCode?: number | null; latencyMs?: number | null } | null
    cloudflare?: { available?: boolean; reason?: string } | null
  }
  site?: { ok?: boolean; statusCode?: number | null }
  cloudflare?: { available?: boolean; reason?: string }
  fighters?: Array<{ name?: string; listenerStatus?: string }>
  systemHealth?: string
  telemetryCount24h?: number
  available?: boolean
  insights?: unknown[]
  source?: string | null
}

const targets = [
  { id: 'security', title: 'Website security & Cloudflare', route: '/api/security/health' },
  { id: 'operations', title: 'Operations telemetry', route: '/api/operations' },
  { id: 'insights', title: 'Aggregate visit insights', route: '/api/magic-dragons' },
  { id: 'preview', title: 'Protected preview deployment', route: '/api/internal-probe' },
]

async function getProbe(target: (typeof targets)[number]): Promise<Probe> {
  const checkedAt = new Date().toISOString()
  try {
    const response = await fetch(target.route, { cache: 'no-store', credentials: 'same-origin' })
    const payload = (await response.json().catch(() => null)) as EndpointPayload | null
    if (response.status === 401) {
      return { ...target, state: 'unauthorized', httpStatus: 401, summary: 'The app session is not authorized for this endpoint.', details: ['Sign in again, then rerun the checks.'], checkedAt }
    }
    if (!response.ok || !payload) {
      return { ...target, state: 'unreachable', httpStatus: response.status, summary: 'The endpoint did not return a usable live response.', details: [payload?.error ?? 'No response details were provided.'], checkedAt }
    }

    if (target.id === 'security') {
      const cloudflareAvailable = payload.cloudflare?.available === true
      const siteReachable = payload.site?.ok === true
      const details = [
        `Website check: ${siteReachable ? 'reachable' : 'unavailable'}${payload.site?.statusCode ? ` · HTTP ${payload.site.statusCode}` : ''}`,
        cloudflareAvailable ? 'Cloudflare analytics: connected' : `Cloudflare analytics: ${String(payload.cloudflare?.reason ?? 'unavailable').replace(/_/g, ' ')}`,
      ]
      return { ...target, state: cloudflareAvailable && siteReachable ? 'online' : 'attention', httpStatus: response.status, summary: cloudflareAvailable && siteReachable ? 'Live site and Cloudflare checks responded.' : 'The route responded; one or more upstream checks need attention.', details, checkedAt }
    }

    if (target.id === 'preview') {
      const site = payload.data?.site
      const cloudflare = payload.data?.cloudflare
      const isVerified = payload.success === true
      const details = [
        `Protected preview response: HTTP ${payload.status ?? 'unavailable'}`,
        `Website check: ${site?.ok ? 'reachable' : 'unavailable'}${site?.statusCode ? ` · HTTP ${site.statusCode}` : ''}`,
        `Cloudflare analytics: ${cloudflare?.available ? 'connected' : String(cloudflare?.reason ?? 'unavailable').replace(/_/g, ' ')}`,
        `Target: ${payload.target ?? 'project preview'}`,
      ]
      return {
        ...target,
        state: isVerified ? 'online' : payload.status === 401 ? 'attention' : 'unreachable',
        httpStatus: payload.status ?? response.status,
        summary: isVerified ? 'Server-side probe passed Vercel protection and read the signed-in preview health endpoint.' : payload.error ?? 'Protected preview health check did not complete.',
        details,
        checkedAt,
      }
    }

    if (target.id === 'operations') {
      const fighters = Array.isArray(payload.fighters) ? payload.fighters : []
      const systemPass = payload.systemHealth === 'PASS'
      const details = [
        `Authenticated telemetry records · 24h: ${Number(payload.telemetryCount24h ?? 0).toLocaleString()}`,
        ...fighters.map((fighter) => `${fighter.name ?? 'Listener'} heartbeat: ${fighter.listenerStatus ?? 'unknown'}`),
      ]
      return { ...target, state: systemPass ? 'online' : 'attention', httpStatus: response.status, summary: systemPass ? 'Operations endpoint and all listener heartbeats report PASS.' : 'Operations endpoint responded; one or more listener heartbeats need attention.', details, checkedAt }
    }

    const insightCount = Array.isArray(payload.insights) ? payload.insights.length : 0
    const hasData = payload.available === true && insightCount > 0
    return {
      ...target,
      state: hasData ? 'online' : 'attention',
      httpStatus: response.status,
      summary: hasData ? 'Aggregate insight feed is responding with live records.' : 'Endpoint is reachable; no aggregate insight records are currently available.',
      details: [
        `Aggregate records returned: ${insightCount}`,
        `Source: ${payload.source ?? 'not reported'}`,
        'This feed contains aggregate country/day counts only.',
      ],
      checkedAt,
    }
  } catch {
    return { ...target, state: 'unreachable', httpStatus: null, summary: 'The endpoint could not be reached from this signed-in browser.', details: ['Check the app connection and try again.'], checkedAt }
  }
}

const fetchDiagnostics = async (): Promise<DiagnosticsSnapshot> => {
  const probes = await Promise.all(targets.map(getProbe))
  return { probes, capturedAt: new Date().toISOString() }
}

const stateLabels: Record<ProbeState, string> = {
  online: 'Verified',
  attention: 'Attention',
  unauthorized: 'Sign-in required',
  unreachable: 'Unavailable',
}

function StateIcon({ state }: { state: ProbeState }) {
  if (state === 'online') return <Check aria-hidden="true" />
  if (state === 'unreachable') return <Unplug aria-hidden="true" />
  if (state === 'unauthorized') return <ShieldCheck aria-hidden="true" />
  return <CircleAlert aria-hidden="true" />
}

export function TelemetryDiagnostics({ operatorName }: { operatorName: string }) {
  const { data, error, isLoading, mutate } = useSWR<DiagnosticsSnapshot>('/api/telemetry-diagnostics', fetchDiagnostics, {
    refreshInterval: 32_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  const verifiedCount = data?.probes.filter((probe) => probe.state === 'online').length ?? 0
  const allVerified = verifiedCount === targets.length

  return (
    <main className="diagnostics-page">
      <div className="diagnostics-shell">
        <header className="diagnostics-header">
          <a className="diagnostics-back" href="/" aria-label="Back to dashboard"><ArrowLeft aria-hidden="true" /> Dashboard</a>
          <span className="diagnostics-brand"><span aria-hidden="true">SC</span> SECURITY CONSOLE</span>
        </header>

        <section className="diagnostics-hero" aria-labelledby="diagnostics-title">
          <p className="diagnostics-kicker"><Activity aria-hidden="true" /> TELEMETRY · CONNECTION CHECK</p>
          <div className="diagnostics-title-row">
            <div>
              <h1 id="diagnostics-title">Telemetry diagnostics</h1>
              <p>Verify the signed-in session and each live data endpoint without exposing connector credentials.</p>
            </div>
            <button className="diagnostics-refresh" type="button" onClick={() => void mutate()} disabled={isLoading}>
              <RefreshCw aria-hidden="true" /> Refresh checks
            </button>
          </div>
        </section>

        <section className="diagnostics-overview" aria-label="Overall connection status">
          <div className="diagnostics-overview-icon"><ShieldCheck aria-hidden="true" /></div>
          <div className="diagnostics-overview-copy">
            <span>Authenticated session</span>
            <strong>{error ? 'Live checks could not complete' : isLoading && !data ? 'Running endpoint checks…' : allVerified ? 'All endpoints verified' : 'Session verified · endpoint attention'}</strong>
            <small>Server-verified session for {operatorName} · required by each checked endpoint</small>
          </div>
          <div className={`diagnostics-count${allVerified ? ' is-good' : ''}`}>
            <strong>{verifiedCount}<span> / {targets.length}</span></strong>
            <small>verified</small>
          </div>
        </section>

        {error && <p className="diagnostics-error" role="alert">The live checks could not be loaded. Use Refresh checks to retry.</p>}

        <section className="diagnostics-grid" aria-label="Live endpoint checks" aria-live="polite">
          {targets.map((target, index) => {
            const probe = data?.probes[index]
            const state = probe?.state
            return (
              <article className={`diagnostics-card${state ? ` state-${state}` : ' state-loading'}`} key={target.id}>
                <div className="diagnostics-card-top">
                  <span className="diagnostics-step">0{index + 1}</span>
                  <span className="diagnostics-state">
                    {state ? <StateIcon state={state} /> : <Clock3 aria-hidden="true" />}
                    {state ? stateLabels[state] : 'Checking'}
                  </span>
                </div>
                <h2>{target.title}</h2>
                <code>{target.route}</code>
                <p className="diagnostics-summary">{probe?.summary ?? 'Waiting for a response from the authenticated endpoint…'}</p>
                {probe && <ul className="diagnostics-details">{probe.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
                <div className="diagnostics-card-footer">
                  <span>{probe?.httpStatus ? `HTTP ${probe.httpStatus}` : probe?.state === 'unreachable' ? 'No HTTP response' : 'Awaiting response'}</span>
                  {probe && <time dateTime={probe.checkedAt}>{new Date(probe.checkedAt).toLocaleTimeString()}</time>}
                </div>
              </article>
            )
          })}
        </section>

        <aside className="diagnostics-privacy">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Credential-safe checks.</strong> These requests use your existing signed-in app session and server-side connector. No access tokens, secrets, or visitor-level history are displayed here.</p>
        </aside>
        <footer className="diagnostics-footer">
          <span>{data ? `Last sweep ${new Date(data.capturedAt).toLocaleString()}` : 'No sweep completed yet'}</span>
          <span>Automatic refresh · every 32 seconds</span>
        </footer>
      </div>
    </main>
  )
}
