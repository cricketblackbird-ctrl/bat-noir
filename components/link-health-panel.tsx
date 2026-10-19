'use client'

import { useState } from 'react'
import { Activity, CircleAlert, Clock3, ExternalLink, ShieldCheck } from 'lucide-react'

type LinkTarget = {
  id: string
  label: string
  url: string
  category: 'Store' | 'Creator' | 'Social' | 'Fundraising' | 'Directory'
  accountMetrics: 'Authorization required' | 'Not connected'
}

type Guardian = {
  id: string
  name: string
  listenerStatus: 'PASS' | 'WAITING' | 'STALE'
  stopped: boolean
}

const destinations: LinkTarget[] = [
  { id: 'shop', label: 'Shop', url: 'https://shopbboutique.co/vibe/montemader-ytsh', category: 'Store', accountMetrics: 'Authorization required' },
  { id: 'patreon', label: 'Patreon', url: 'https://patreon.com/montemader', category: 'Creator', accountMetrics: 'Authorization required' },
  { id: 'substack', label: 'Substack', url: 'https://substack.com/@montemader', category: 'Creator', accountMetrics: 'Not connected' },
  { id: 'instagram', label: 'Instagram', url: 'https://instagram.com/montemader', category: 'Social', accountMetrics: 'Authorization required' },
  { id: 'tiktok', label: 'TikTok', url: 'https://tiktok.com/@montemader', category: 'Social', accountMetrics: 'Authorization required' },
  { id: 'facebook', label: 'Facebook', url: 'https://facebook.com/montemader', category: 'Social', accountMetrics: 'Authorization required' },
  { id: 'twloha', label: 'TWLOHA', url: 'https://give.twloha.com/MonteMader', category: 'Fundraising', accountMetrics: 'Not connected' },
  { id: 'linktree', label: 'Linktree', url: 'https://linktr.ee/MonteMader', category: 'Directory', accountMetrics: 'Not connected' },
]

const statusLabel: Record<Guardian['listenerStatus'], string> = {
  PASS: 'Heartbeat verified',
  WAITING: 'Waiting for heartbeat',
  STALE: 'Heartbeat stale',
}

export function LinkHealthPanel({ guardians }: { guardians: Guardian[] }) {
  const [selectedId, setSelectedId] = useState(destinations[0].id)
  const selected = destinations.find((destination) => destination.id === selectedId) ?? destinations[0]

  return (
    <section className="link-health-panel" aria-labelledby="link-health-heading">
      <header className="link-health-header">
        <div>
          <p className="section-kicker">PRIVATE LINK &amp; ACCOUNT HEALTH</p>
          <h2 id="link-health-heading">Your destinations</h2>
          <p>Choose a destination to view its monitoring and account-connection status. These controls stay in this dashboard; they never open the external site.</p>
        </div>
        <span className="link-health-status"><span aria-hidden="true" />External monitor not connected</span>
      </header>

      <div className="link-destination-grid" role="group" aria-label="Choose a destination">
        {destinations.map((destination) => (
          <button
            aria-pressed={selected.id === destination.id}
            className={`link-destination-button${selected.id === destination.id ? ' is-selected' : ''}`}
            key={destination.id}
            onClick={() => setSelectedId(destination.id)}
            type="button"
          >
            <span>{destination.label}</span>
            <small>{destination.category}</small>
          </button>
        ))}
      </div>

      <article className="link-health-detail" aria-live="polite" aria-labelledby="link-detail-heading">
        <div className="link-detail-heading">
          <div>
            <p className="section-kicker">SELECTED DESTINATION</p>
            <h3 id="link-detail-heading">{selected.label}</h3>
          </div>
          <span className="link-detail-unavailable"><CircleAlert aria-hidden="true" />Monitoring unavailable</span>
        </div>

        <dl className="link-health-metrics">
          <div><dt>Public URL</dt><dd className="link-url">{selected.url}</dd></div>
          <div><dt>Last checked</dt><dd>Not available</dd></div>
          <div><dt>Response status</dt><dd>No external probe data</dd></div>
          <div><dt>Latency trend</dt><dd>No measurements yet</dd></div>
          <div><dt>Private account metrics</dt><dd>{selected.accountMetrics}</dd></div>
          <div><dt>Items needing attention</dt><dd>Monitoring setup required</dd></div>
        </dl>
      </article>

      <div className="link-health-lower-grid">
        <section className="link-health-note" aria-labelledby="monitor-privacy-heading">
          <div className="link-note-icon"><ShieldCheck aria-hidden="true" /></div>
          <div>
            <h3 id="monitor-privacy-heading">External-only checks</h3>
            <p>No availability or latency checks run from this page. A separately deployed monitor must perform low-frequency, read-only checks and return scrubbed summaries before live status can appear here. Probe IPs, visitor IPs, and credentials are not displayed.</p>
            <p className="link-health-cadence"><Clock3 aria-hidden="true" /> Proposed check interval: every 15 minutes · not active</p>
          </div>
        </section>

        <section className="link-health-note" aria-labelledby="guardian-link-heading">
          <div className="link-note-icon"><Activity aria-hidden="true" /></div>
          <div>
            <h3 id="guardian-link-heading">Guardian readiness</h3>
            <p>Ruach, Xena, and SuperBot are the three listeners assigned to this site. A fresh authenticated heartbeat confirms only that a listener reported in; it does not prove they are scanning or protecting your other platform accounts. External checks are not connected.</p>
            {guardians.length ? (
              <ul className="guardian-link-list">
                {guardians.map((guardian) => (
                  <li key={guardian.id}>
                    <span>{guardian.name}</span>
                    <span className={`guardian-link-state is-${guardian.listenerStatus.toLowerCase()}`}>{guardian.stopped ? 'Execution stopped' : statusLabel[guardian.listenerStatus]}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="guardian-link-empty">Live listener status is unavailable until the authenticated operations feed loads.</p>}
          </div>
        </section>
      </div>

      <p className="link-health-footnote"><ExternalLink aria-hidden="true" /> Account analytics require a separate official read-only authorization for each supported platform. No account credentials or analytics are connected yet.</p>
    </section>
  )
}
