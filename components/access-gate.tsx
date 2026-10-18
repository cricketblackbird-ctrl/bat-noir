'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

type AccessGateProps = {
  allowInitialSignup: boolean
}

export function AccessGate({ allowInitialSignup }: AccessGateProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
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
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({
            name: username,
            email: String(formData.get('email') ?? '').trim(),
            username,
            displayUsername: username,
            password,
          })
        : await authClient.signIn.username({ username, password })

      if (result.error) throw new Error('Authentication failed')
      router.refresh()
    } catch {
      setError('We could not verify those details. Please check them and try again.')
    } finally {
      setBusy(false)
    }
  }

  const isCreatingFirstAccount = allowInitialSignup && mode === 'sign-up'

  return (
    <main className="auth-screen">
      <div className="auth-light-flight" aria-hidden="true">
        <span className="auth-light-sweep auth-light-sweep-left" />
        <span className="auth-light-sweep auth-light-sweep-right" />
        <span className="auth-light-sweep auth-light-sweep-left" />
        <span className="auth-light-sweep auth-light-sweep-right" />
      </div>
      <div className="auth-card" aria-labelledby="auth-title">
        <section className="auth-content">
          <h1 id="auth-title">{isCreatingFirstAccount ? 'Create your sign-in' : 'Sign in'}</h1>
          <p className="auth-description">
            {isCreatingFirstAccount
              ? 'Set a username and password to open the control room. First-account setup closes after this.'
              : 'Good to have you back.'}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {isCreatingFirstAccount && (
              <div className="auth-field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" name="email" autoComplete="email" required maxLength={254} />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_.]+"
                title="Use 3–30 letters, numbers, periods, or underscores."
              />
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                name="password"
                autoComplete={isCreatingFirstAccount ? 'new-password' : 'current-password'}
                required
                minLength={8}
                maxLength={128}
              />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : isCreatingFirstAccount ? 'CREATE ACCOUNT' : 'ENTER'}
            </button>
          </form>

          {allowInitialSignup && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setError('')
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
              }}
            >
              {mode === 'sign-in' ? 'Set up the first account' : 'Back to sign in'}
            </button>
          )}
        </section>
      </div>
    </main>
  )
}
