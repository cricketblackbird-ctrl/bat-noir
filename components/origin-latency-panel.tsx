'use client'

import { useState } from 'react'

type ResultState = 'idle' | 'checking' | 'ok' | 'error'
type ProbeResult = {
  ok?: boolean
  markerFound?: boolean
  statusCode?: number | null
  latencyMs?: number | null
  error?: string
}

export function OriginLatencyPanel() {
  const [state, setState] = useState<ResultState>('idle')
  const [status, setStatus] = useState('Ready')
  const [latency, setLatency] = useState('—')
  const [details, setDetails] = useState('The authenticated server probe checks the configured origin for its verification marker.')

  async function checkOrigin() {
    setState('checking')
    setStatus('Checking…')
    setLatency('—')
    setDetails('Connecting directly to the configured origin over HTTPS and checking its page marker.')

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
        setStatus('Origin marker verified')
        setLatency(`${result.latencyMs} ms`)
        setDetails(`HTTPS · HTTP ${result.statusCode} · verification marker found in /`)
        return
      }

      setState('error')
      setStatus(result.statusCode && result.statusCode >= 200 && result.statusCode < 300
        ? 'Origin reached · marker missing'
        : result.statusCode ? 'Origin returned an error' : 'Origin unreachable')
      setLatency(typeof result.latencyMs === 'number' ? `${result.latencyMs} ms` : '—')
      setDetails(result.statusCode
        ? `HTTP ${result.statusCode} · ${result.markerFound ? 'verification marker found' : 'expected marker not found in /'}`
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
      <h2 id="origin-latency-heading">Origin Verification</h2>
      <p className="origin-latency-intro">Measure the HTTPS response from the configured origin and check for its verification marker.</p>
      <div className="origin-latency-secret-note" role="note">
        <strong>Origin target is stored securely in Vercel</strong>
        <span>ORIGIN_IP is read only by this authenticated server route and is never sent to your browser. For a raw IPv4 target, the server connects directly to that address and uses montemader.com for TLS and Host.</span>
      </div>
      <button className="origin-latency-button" type="button" onClick={checkOrigin} disabled={state === 'checking'}>
        {state === 'checking' ? 'Checking…' : 'Check Configured Origin'}
      </button>
      <section className="origin-latency-result" data-state={state} aria-live="polite" aria-atomic="true">
        <strong>{status}</strong>
        <div className="origin-latency-value">{latency}</div>
        <p>{details}</p>
      </section>
      <p className="origin-latency-caveat">The check requests the origin homepage directly over HTTPS and looks for the expected meta marker. This verifies that the configured target serves that marker; the marker is not cryptographic proof or a security bypass. The probe does not change DNS, Cloudflare, or firewall settings.</p>
    </section>
  )
}
