'use client'

import { useCallback, useEffect } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

type DnsAnswer = { type: string; value: string; ttl?: number }
type DnsHistoryItem = {
  id: string
  hostname: string
  observedAt: string
  source: string
  status: string
  answers: DnsAnswer[]
  redactedAddressCount: number
  error: string | null
}
type DnsSnapshot = { hostname: string; enabled: boolean; updatedAt: string | null; history: DnsHistoryItem[] }
type Action = { action: 'toggle'; enabled: boolean } | { action: 'capture' }

async function fetchSnapshot(url: string): Promise<DnsSnapshot> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Could not load DNS history.')
  return response.json()
}

async function postAction(url: string, { arg }: { arg: Action }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(arg),
  })
  if (!response.ok) throw new Error(response.status === 409 ? 'Capture is turned off.' : 'DNS history action failed.')
  return response.json()
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date)
}

export function DnsHistoryPanel() {
  const { data, error, mutate } = useSWR<DnsSnapshot>('/api/dns-history', fetchSnapshot, {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
  const { trigger, isMutating } = useSWRMutation('/api/dns-history', postAction)

  const capture = useCallback(async () => {
    try {
      await trigger({ action: 'capture' })
      await mutate()
    } catch {
      await mutate()
    }
  }, [mutate, trigger])

  useEffect(() => {
    if (!data?.enabled) return
    void capture()
    const interval = window.setInterval(() => void capture(), 60_000)
    return () => window.clearInterval(interval)
  }, [capture, data?.enabled])

  async function setEnabled(enabled: boolean) {
    try {
      await trigger({ action: 'toggle', enabled })
      await mutate()
    } catch {
      await mutate()
    }
  }

  return (
    <section className="dns-history-card" aria-labelledby="dns-history-heading">
      <div className="dns-history-header">
        <div>
          <p className="section-kicker">DOMAIN CHECKS</p>
          <h3 id="dns-history-heading">DNS history · montemader.com</h3>
        </div>
        <button
          className="dns-history-toggle"
          type="button"
          role="switch"
          aria-checked={data?.enabled ?? false}
          aria-label="Enable DNS history capture"
          disabled={!data || isMutating}
          onClick={() => void setEnabled(!data?.enabled)}
        >
          <span aria-hidden="true" />
          {data?.enabled ? 'On' : 'Off'}
        </button>
      </div>

      <p className="dns-history-explanation">When on, this panel checks DNS about once a minute while the dashboard is open. A-record addresses stay server-side and are withheld from browser responses; nameserver results remain visible. This does not change your DNS or firewall settings.</p>

      {error ? (
        <p className="dns-history-state" role="alert">DNS history is unavailable. Check your signed-in operator access and try again.</p>
      ) : !data ? (
        <p className="dns-history-state" role="status">Loading DNS history…</p>
      ) : (
        <>
          <div className="dns-history-status" role="status">
            <span className={`dns-history-dot ${data.enabled ? 'is-on' : ''}`} aria-hidden="true" />
            <span>{data.enabled ? 'Capture enabled while this panel is open' : 'Capture paused'}</span>
            <span>Showing {data.history.length} recent · 500 max</span>
          </div>
          <ul className="dns-history-list" aria-label="Recent DNS checks">
            {data.history.length ? data.history.map((item) => (
              <li key={item.id}>
                <time dateTime={item.observedAt}>{formatTime(item.observedAt)}</time>
                <span className={`dns-history-result is-${item.status}`}>{item.status}</span>
                <div className="dns-history-answers">
                  {item.redactedAddressCount > 0 && <span><b>A</b> {item.redactedAddressCount} address{item.redactedAddressCount === 1 ? '' : 'es'} withheld</span>}
                  {item.answers.map((answer) => (
                    <span key={`${answer.type}-${answer.value}`}><b>{answer.type}</b> {answer.value}{answer.ttl ? ` · TTL ${answer.ttl}s` : ''}</span>
                  ))}
                  {!item.redactedAddressCount && item.answers.length === 0 && <span>{item.error ?? 'No DNS answers returned.'}</span>}
                </div>
              </li>
            )) : <li className="dns-history-empty">No checks yet. Turn capture on to start a timestamped history.</li>}
          </ul>
          <details className="dns-history-details">
            <summary>How the history works</summary>
            <p>Checks use the server&apos;s configured DNS resolver, every 60 seconds while this page is open. Newest results appear first; the database retains at most 500 checks for this domain, removing the oldest automatically. This is a DNS lookup history, not Cloudflare firewall logs. Toggle off to stop new checks; saved history remains.</p>
          </details>
        </>
      )}
    </section>
  )
}
