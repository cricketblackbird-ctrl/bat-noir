'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { formatCentralTime } from '@/lib/format-time'

type CloudflareSnapshot = {
  domain: string
  capturedAt: string
  cloudflare:
    | {
        available: true
        metrics: {
          requests24h: number
          bytes24h: number
          blockedOrChallenged60s: number
          blocked60s: number
          challenged60s: number
          threshold: number
          thresholdMet: boolean
        }
      }
    | {
        available: false
        reason: string
      }
  site: { ok: boolean; statusCode: number | null; latencyMs: number | null }
  activeIncident: { detectedAt: string; blockedCount: number } | null
}

export type BrowserHints = {
  online: boolean
  visible: boolean
  processorCount: number | null
  approximateMemoryGb: number | null
  connectionType: string | null
  estimatedDownlinkMbps: number | null
  estimatedRttMs: number | null
  dataSaver: boolean | null
  checkedAt: string
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number
  connection?: EventTarget & {
    effectiveType?: string
    downlink?: number
    rtt?: number
    saveData?: boolean
  }
}

export function readBrowserHints(): BrowserHints {
  const browser = navigator as NavigatorWithHints
  const connection = browser.connection
  return {
    online: navigator.onLine,
    visible: document.visibilityState === 'visible',
    processorCount: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
    approximateMemoryGb: Number.isFinite(browser.deviceMemory) ? browser.deviceMemory ?? null : null,
    connectionType: connection?.effectiveType ?? null,
    estimatedDownlinkMbps: Number.isFinite(connection?.downlink) ? connection?.downlink ?? null : null,
    estimatedRttMs: Number.isFinite(connection?.rtt) ? connection?.rtt ?? null : null,
    dataSaver: typeof connection?.saveData === 'boolean' ? connection.saveData : null,
    checkedAt: new Date().toISOString(),
  }
}

const fetcher = async (url: string): Promise<CloudflareSnapshot> => {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to view Cloudflare security status.' : 'Live Cloudflare status is temporarily unavailable.')
  return response.json() as Promise<CloudflareSnapshot>
}

function hintValue(value: string | number | boolean | null, suffix = '') {
  if (value === null) return 'Not provided by this browser'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return `${value}${suffix}`
}

export function BrowserEnvironmentPanel() {
  const [browserHints, setBrowserHints] = useState<BrowserHints | null>(null)
  const { data, error, isLoading, mutate } = useSWR<CloudflareSnapshot>('/api/security/health', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })

  useEffect(() => {
    const updateHints = () => setBrowserHints(readBrowserHints())
    const connection = (navigator as NavigatorWithHints).connection
    updateHints()
    window.addEventListener('online', updateHints)
    window.addEventListener('offline', updateHints)
    document.addEventListener('visibilitychange', updateHints)
    connection?.addEventListener('change', updateHints)
    return () => {
      window.removeEventListener('online', updateHints)
      window.removeEventListener('offline', updateHints)
      document.removeEventListener('visibilitychange', updateHints)
      connection?.removeEventListener('change', updateHints)
    }
  }, [])

  const alertLabel = !data || !data.cloudflare.available
    ? 'Waiting for live Cloudflare status'
    : data.cloudflare.metrics.thresholdMet
      ? data.activeIncident
        ? `Security alert: ${data.cloudflare.metrics.blocked60s + data.cloudflare.metrics.challenged60s} requests blocked or challenged in 60 seconds; incident active.`
        : `Security alert: ${data.cloudflare.metrics.blocked60s + data.cloudflare.metrics.challenged60s} requests blocked or challenged in 60 seconds; incident check pending.`
      : `No security alert: ${data.cloudflare.metrics.blocked60s + data.cloudflare.metrics.challenged60s} blocked or challenged in 60 seconds, below the ${data.cloudflare.metrics.threshold} alert threshold.`

  return (
    <section className="panel browser-data-panel" aria-labelledby="browser-data-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">GENERAL PURPOSE · LIVE DATA</p><h2 id="browser-data-heading">Browser &amp; Cloudflare</h2></div>
        <button className="text-button" type="button" onClick={() => void mutate()} disabled={isLoading}>Refresh live data</button>
      </div>

      <section className="browser-data-section" aria-labelledby="browser-hints-heading">
        <div className="browser-data-subheading"><h3 id="browser-hints-heading">This browser</h3><span>Local · not uploaded{browserHints ? ` · checked ${formatCentralTime(browserHints.checkedAt)}` : ''}</span></div>
        <div className="browser-signal-grid">
          <article className="browser-signal"><span>Connection</span><strong>{browserHints ? browserHints.online ? 'Browser reports online' : 'Browser reports offline' : 'Checking browser'}</strong></article>
          <article className="browser-signal"><span>Page visibility</span><strong>{browserHints ? browserHints.visible ? 'Visible' : 'Backgrounded' : 'Checking browser'}</strong></article>
          <article className="browser-signal"><span>Processor hint</span><strong>{hintValue(browserHints?.processorCount ?? null, ' logical cores')}</strong></article>
          <article className="browser-signal"><span>Memory hint</span><strong>{hintValue(browserHints?.approximateMemoryGb ?? null, ' GB · approximate')}</strong></article>
          <article className="browser-signal"><span>Connection type</span><strong>{hintValue(browserHints?.connectionType ?? null)}</strong></article>
          <article className="browser-signal"><span>Estimated downlink / RTT</span><strong>{browserHints?.estimatedDownlinkMbps === null || !browserHints ? 'Not provided by this browser' : `${browserHints.estimatedDownlinkMbps} Mbps · ${browserHints.estimatedRttMs === null ? 'RTT unavailable' : `${browserHints.estimatedRttMs} ms RTT`}`}</strong></article>
          <article className="browser-signal"><span>Data saver preference</span><strong>{hintValue(browserHints?.dataSaver ?? null)}</strong></article>
        </div>
        <p className="browser-data-note">Coarse hints reported by your browser only. No browsing history, IP address, process list, or device identifier is read, stored, or sent. Browser online status does not prove site reachability.</p>
      </section>

      <section className="browser-data-section cloudflare-emergency" aria-labelledby="cloudflare-live-heading" aria-live="polite">
        <div className="browser-data-subheading"><h3 id="cloudflare-live-heading">Cloudflare connection</h3><div className="cloudflare-heading-actions"><span className={`cloudflare-state ${data?.cloudflare.available ? 'is-online' : 'is-offline'}`} role="status"><span aria-hidden="true" />{data?.cloudflare.available ? 'ONLINE' : error ? 'CHECK CONNECTION' : isLoading || !data ? 'CONNECTING' : 'UNAVAILABLE'}</span><a className="cloudflare-dashboard-link" href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Open dashboard ↗</a></div></div>
        {error ? (
          <p className="cloudflare-live-message is-unavailable" role="alert">{error.message} No sample values are shown.</p>
        ) : isLoading || !data ? (
          <p className="cloudflare-live-message" role="status">Connecting to authenticated Cloudflare analytics…</p>
        ) : !data.cloudflare.available ? (
          <p className="cloudflare-live-message is-unavailable" role="status">Cloudflare could not provide live security data ({data.cloudflare.reason}). Use the dashboard link above to review your Cloudflare account and zone access.</p>
        ) : (
          <>
            <p className={`cloudflare-live-message ${data.cloudflare.metrics.thresholdMet ? 'is-alert' : 'is-clear'}`} role="status"><span className="cloudflare-status-light" aria-hidden="true" />{alertLabel}</p>
            <p className="cloudflare-explainer">This is Cloudflare&apos;s blocked/challenged traffic count, not proof of a breach. Website reachability and response time are shown separately.</p>
            <div className="browser-signal-grid cloudflare-metrics">
              <article className="browser-signal"><span>Requests · 24h</span><strong>{data.cloudflare.metrics.requests24h.toLocaleString()}</strong></article>
              <article className="browser-signal"><span>Blocked · 60s</span><strong>{data.cloudflare.metrics.blocked60s.toLocaleString()}</strong></article>
              <article className="browser-signal"><span>Challenged · 60s</span><strong>{data.cloudflare.metrics.challenged60s.toLocaleString()}</strong></article>
              <article className="browser-signal"><span>Emergency threshold</span><strong>{data.cloudflare.metrics.threshold.toLocaleString()} blocked/challenged per 60s</strong></article>
              <article className="browser-signal"><span>Website reachability</span><strong>{data.site.ok ? 'Reachable' : 'Unavailable'}</strong></article>
              {data.activeIncident && <article className="browser-signal"><span>Incident detected</span><strong>{formatCentralTime(data.activeIncident.detectedAt)} · {data.activeIncident.blockedCount.toLocaleString()} requests</strong></article>}
            </div>
          </>
        )}
        <p className="browser-data-note">Live aggregate data is fetched server-side through the existing Cloudflare connection. The existing monitor records threshold incidents; this view does not change Cloudflare rules.</p>
      </section>
    </section>
  )
}
