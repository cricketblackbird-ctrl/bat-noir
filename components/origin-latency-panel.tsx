'use client'

import { useState } from 'react'

type ResultState = 'idle' | 'checking' | 'ok' | 'error'
type ProbeResult = {
  ok?: boolean
  statusCode?: number | null
  latencyMs?: number | null
  error?: string
}

export function OriginLatencyPanel() {
  const [state, setState] = useState<ResultState>('idle')
  const [status, setStatus] = useState('Ready')
  const [latency, setLatency] = useState('—')
  const [details, setDetails] = useState('The origin address is stored as a server-side Vercel environment variable.')

  async function checkOrigin() {
    setState('checking')
    setStatus('Checking…')
    setLatency('—')
    setDetails('Connecting to the configured origin over HTTPS.')

    try {
      const response = await fetch('/api/origin-health', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      })
      const result = await response.json() as ProbeResult

      if (!response.ok && response.status !== 502) {
        setState('error')
        setStatus(response.status === 401 ? 'Sign in required' : 'Check unavailable')
        setDetails(result.error ?? 'The origin check is not configured.')
        return
      }

      if (result.ok && typeof result.latencyMs === 'number') {
        setState('ok')
        setStatus('Origin responded')
        setLatency(`${result.latencyMs} ms`)
        setDetails(`HTTPS · ${result.statusCode} · /api/health`)
        return
      }

      setState('error')
      setStatus(result.statusCode ? 'Origin returned an error' : 'Origin unreachable')
      setLatency(typeof result.latencyMs === 'number' ? `${result.latencyMs} ms` : '—')
      setDetails(result.statusCode
        ? `HTTP ${result.statusCode} · /api/health`
        : result.error ?? 'Vercel could not reach the configured origin.')
    } catch (error) {
      setState('error')
      setStatus('Check failed')
      setLatency('—')
      setDetails(error instanceof DOMException && error.name === 'TimeoutError'
        ? 'The check timed out before the origin responded.'
        : 'Could not reach the origin health-check service.')
    }
  }

  return (
    <section className="origin-latency-panel" aria-labelledby="origin-latency-heading">
      <h2 id="origin-latency-heading">Origin Latency Test</h2>
      <p className="origin-latency-intro">Test the server response time for your configured origin health endpoint.</p>
      <div className="origin-latency-secret-note" role="note">
        <strong>Origin IP: stored securely in Vercel</strong>
        <span>ORIGIN_IP is only read by the authenticated server route and is never sent to your browser.</span>
      </div>
      <button className="origin-latency-button" type="button" onClick={checkOrigin} disabled={state === 'checking'}>
        {state === 'checking' ? 'Checking…' : 'Check Configured Origin'}
      </button>
      <section className="origin-latency-result" data-state={state} aria-live="polite" aria-atomic="true">
        <strong>{status}</strong>
        <div className="origin-latency-value">{latency}</div>
        <p>{details}</p>
      </section>
      <p className="origin-latency-caveat">The check runs from Vercel directly to the configured IPv4 address over HTTPS, using the site hostname for TLS verification. The origin must have a valid certificate for montemader.com and serve /api/health on port 443. This does not change DNS, Cloudflare, or firewall settings.</p>
    </section>
  )
}
