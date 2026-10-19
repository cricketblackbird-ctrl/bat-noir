'use client'

import { FormEvent, useState } from 'react'

type ResultState = 'idle' | 'checking' | 'ok' | 'error'

export function OriginLatencyPanel() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<ResultState>('idle')
  const [status, setStatus] = useState('Ready')
  const [latency, setLatency] = useState('—')
  const [details, setDetails] = useState('Awaiting target URL…')

  async function checkOrigin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    let target: URL
    const enteredValue = url.trim()
    const normalizedValue = /^[a-z][a-z\d+.-]*:\/\//i.test(enteredValue) ? enteredValue : `https://${enteredValue}`
    try {
      target = new URL(normalizedValue)
    } catch {
      setState('error')
      setStatus('Invalid URL')
      setLatency('—')
      setDetails('Enter a complete URL, including http:// or https://.')
      return
    }

    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      setState('error')
      setStatus('Invalid URL')
      setLatency('—')
      setDetails('Only HTTP and HTTPS URLs are supported.')
      return
    }

    if (target.username || target.password) {
      setState('error')
      setStatus('URL not allowed')
      setLatency('—')
      setDetails('Remove any username or password from the URL before checking it.')
      return
    }

    setState('checking')
    setStatus('Checking…')
    setLatency('—')
    setDetails('Waiting for target response (10-second timeout).')

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 10000)
    const startedAt = performance.now()

    try {
      const response = await fetch(target.href, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain, */*' },
      })
      const elapsedMs = Math.round(performance.now() - startedAt)
      setState(response.ok ? 'ok' : 'error')
      setStatus(response.ok ? 'Target responded' : 'Target returned an error')
      setLatency(`${elapsedMs} ms`)
      setDetails(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} · ${target.href}`)
    } catch (error) {
      setState('error')
      setStatus('Request failed')
      setLatency('—')
      setDetails(error instanceof DOMException && error.name === 'AbortError'
        ? 'The request timed out after 10 seconds.'
        : 'The request could not be completed. Check the URL, network access, TLS certificate, and CORS settings.')
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  return (
    <section className="origin-latency-panel" aria-labelledby="origin-latency-heading">
      <h2 id="origin-latency-heading">Origin Latency Test</h2>
      <p className="origin-latency-intro">Measure the response time of a health-check URL. Enter a reachable origin address to test it directly; this can&apos;t bypass a CDN if the URL still points to the CDN.</p>
      <form className="origin-latency-form" onSubmit={checkOrigin}>
        <label htmlFor="origin-latency-url">Origin IP Address or Raw URL</label>
        <input
          id="origin-latency-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://your-origin.example.com/api/health"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          aria-describedby="origin-latency-warning"
        />
        <span id="origin-latency-warning" className="origin-latency-warning">Enter the exact reachable backend IP or host. Don&apos;t use your public domain if you want to test the origin directly.</span>
        <button type="submit" disabled={state === 'checking'}>
          {state === 'checking' ? 'Checking…' : 'Check Direct Connection'}
        </button>
      </form>
      <section className="origin-latency-result" data-state={state} aria-live="polite" aria-atomic="true">
        <strong>{status}</strong>
        <div className="origin-latency-value">{latency}</div>
        <p>{details}</p>
      </section>
      <p className="origin-latency-caveat">The origin must be reachable from your browser and allow cross-origin requests (CORS). A failed browser request can mean CORS or network blocking—not necessarily that the server is offline. This check does not change DNS, Cloudflare, or firewall settings.</p>
    </section>
  )
}
