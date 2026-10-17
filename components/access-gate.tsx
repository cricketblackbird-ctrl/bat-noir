'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AccessGate() {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    setError('')
    setBusy(true)

    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password })
      if (result.error) throw new Error('Authentication failed')
      router.refresh()
    } catch {
      setError('We could not verify those details. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-mark" aria-hidden="true">✦</div>
        <p className="eyebrow">MONTEMADER · PRIVATE CONTROL</p>
        <h1 id="auth-title">A quieter kind of strength.</h1>
        <p className="auth-copy">Sign in to view verified telemetry and coordinate defensive responses.</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'sign-up' && allowInitialSignup && <label>Operator name<input name="name" autoComplete="name" required maxLength={80} /></label>}
          <label>Email<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input type="password" name="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Securing session…' : mode === 'sign-in' ? 'Enter command room' : 'Create operator account'}
          </button>
        </form>
        {allowInitialSignup && <button className="text-button" type="button" onClick={() => { setError(''); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in') }}>
          {mode === 'sign-in' ? 'First visit? Create the initial MM account' : 'Already registered? Sign in'}
        </button>}
        <p className="auth-note">{allowInitialSignup ? 'The first registered operator claims MM authority. All later control changes are server-verified.' : 'Initial MM registration is complete. New account registration is closed.'}</p>
      </section>
    </main>
  )
}
