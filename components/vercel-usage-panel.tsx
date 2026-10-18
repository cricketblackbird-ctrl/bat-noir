'use client'

import useSWR from 'swr'
import { formatCentralDateTime } from '@/lib/format-time'

type UsageSnapshot = {
  capturedAt: string
  project: { id: string; name: string }
  team: { id: string; slug: string }
  period: { from: string; through: string; timezone: 'UTC' }
  analytics:
    | { available: true; paths: Array<{ path: string; views: number }>; pathViewsTotal: number; returnedPathCount: number }
    | { available: false; reason: string }
  billing:
    | { available: true; currencies: Array<{ currency: string; billedCost: number; effectiveCost: number; chargeCount: number }>; chargeCount: number }
    | { available: false; reason: string }
}

const fetcher = async (url: string): Promise<UsageSnapshot> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sign in again to view Vercel usage.')
    if (response.status === 403) throw new Error('Vercel usage is restricted to the authorized operator account.')
    throw new Error('The Vercel usage report is unavailable.')
  }
  return response.json() as Promise<UsageSnapshot>
}

function formatCurrency(amount: number, currency: string) {
  if (currency === 'Unknown currency') return amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 4 }).format(amount)
  } catch {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${currency}`
  }
}

function safeInternalPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//') && !/[\u0000-\u001f\u007f]/.test(path)
}

export function VercelUsagePanel() {
  const { data, error, isLoading, mutate } = useSWR<UsageSnapshot>('/api/vercel-usage', fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 60_000,
  })
  const period = data ? `${data.period.from}–${data.period.through} UTC` : 'UTC · month to date'

  return (
    <section className="website-data-panel vercel-usage-panel" aria-labelledby="vercel-usage-heading" aria-live="polite">
      <div className="website-data-heading vercel-usage-heading">
        <div>
          <div><p className="section-kicker">VERCEL · LIVE SOURCE</p><h3 id="vercel-usage-heading">Usage &amp; page paths</h3></div>
          <span>{data ? `Updated ${formatCentralDateTime(data.capturedAt)}` : period}</span>
        </div>
        <button className="text-button" type="button" onClick={() => void mutate()} disabled={isLoading}>Refresh Vercel data</button>
      </div>

      <div className="vercel-source-links" aria-label="Vercel source dashboards">
        <a href="https://vercel.com/cricketblackbird-4588/~/usage" target="_blank" rel="noreferrer">Open team Usage ↗</a>
        <a href="https://vercel.com/cricketblackbird-4588/master_control_suite/analytics" target="_blank" rel="noreferrer">Open project Analytics ↗</a>
      </div>

      {error ? (
        <p className="website-data-message is-unavailable" role="alert">{error.message}</p>
      ) : isLoading || !data ? (
        <p className="website-data-message" role="status">Requesting authenticated Vercel usage and analytics…</p>
      ) : (
        <>
          <div className="website-metrics-grid">
            <article className="website-metric">
              <span>Views across returned paths</span>
              <strong>{data.analytics.available ? data.analytics.pathViewsTotal.toLocaleString() : 'Unavailable'}</strong>
              <small>{data.analytics.available ? `Up to ${data.analytics.returnedPathCount} top paths · ${period}` : data.analytics.reason}</small>
            </article>
            <article className="website-metric">
              <span>Team billed cost · month to date</span>
              <strong>{!data.billing.available ? 'Unavailable' : data.billing.currencies.length === 0 ? 'No charges' : data.billing.currencies.length === 1 ? formatCurrency(data.billing.currencies[0].billedCost, data.billing.currencies[0].currency) : `${data.billing.currencies.length} currencies`}</strong>
              <small>{data.billing.available ? `${data.billing.chargeCount.toLocaleString()} team charge records · all projects` : data.billing.reason}</small>
            </article>
          </div>

          <section className="vercel-path-section" aria-labelledby="vercel-paths-heading">
            <div className="browser-data-subheading"><h4 id="vercel-paths-heading">Top website paths</h4><span>Click a path to open it on this site</span></div>
            {!data.analytics.available ? (
              <p className="website-data-message is-unavailable" role="status">{data.analytics.reason}</p>
            ) : data.analytics.paths.length === 0 ? (
              <p className="website-data-message" role="status">No page paths were returned for this period. Vercel Web Analytics may have no recorded visits yet.</p>
            ) : (
              <ol className="vercel-path-list">
                {data.analytics.paths.map(({ path, views }) => (
                  <li key={path}>
                    {safeInternalPath(path) ? <a href={path}>{path}</a> : <span>{path}</span>}
                    <strong>{views.toLocaleString()} views</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {data.billing.available && data.billing.currencies.length > 1 && (
            <ul className="vercel-currency-list" aria-label="Team billed costs by currency">
              {data.billing.currencies.map((total) => <li key={total.currency}><span>{total.currency} · billed</span><strong>{formatCurrency(total.billedCost, total.currency)}</strong></li>)}
            </ul>
          )}

          <details className="vercel-provenance">
            <summary>How these numbers are sourced</summary>
            <p>The Usage link you shared is the team billing source. This page calls Vercel&apos;s authenticated billing-charges endpoint for the team and the Analytics visits-aggregate endpoint for this project, grouped by request path. Both requests run on the server; the bearer token is never sent to the browser. The date window is month-to-date in UTC. Billing is team-wide across projects, while path counts belong to {data.project.name}.</p>
            <p>Path counts are the sum of at most 100 returned paths, not a guaranteed site-wide total. They are page views, not unique people. Linked paths open on this site; Vercel&apos;s source dashboards remain available above for cross-checking. An unavailable source is shown as unavailable rather than replaced with estimates.</p>
            <code>GET /v1/billing/charges · GET /v1/query/web-analytics/visits/aggregate</code>
          </details>
        </>
      )}
    </section>
  )
}
