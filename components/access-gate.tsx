'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AccessGate() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    const formData = new FormData(event.currentTarget)
    const username = String(formData.get('username') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    setError('')
    setBusy(true)

    try {
      const result = await authClient.signIn.username({ username, password })
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
      <div className="auth-card" aria-labelledby="auth-title">
        <section className="auth-content">
          <h1 id="auth-title">Sign in</h1>
          <p className="auth-description">Good to have you back.</p>

          <form className="auth-form" onSubmit={submit}>
            <div className="auth-field">
              <label htmlFor="username">Sign in</label>
              <input id="username" type="text" name="username" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={30} />
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" name="password" autoComplete="current-password" required minLength={8} maxLength={128} />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : 'ENTER'}
            </button>
          </form>
        </section>

      </div>
    </main>
  )
}
