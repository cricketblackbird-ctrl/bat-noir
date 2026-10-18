'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

type AccessGateProps = {
  allowInitialSignup: boolean
  resetToken?: string
}

type AccessMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'

export function AccessGate({ allowInitialSignup, resetToken }: AccessGateProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AccessMode>(resetToken ? 'reset-password' : 'sign-in')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return

    const formData = new FormData(event.currentTarget)
    setError('')
    setNotice('')
    setBusy(true)

    try {
      if (mode === 'forgot-password') {
        const email = String(formData.get('email') ?? '').trim()
        if (!email.toLowerCase().endsWith('@cricketblackbird.com')) {
          setError('For your privacy, reset emails can only be sent to an @cricketblackbird.com address.')
          return
        }
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (result.error) throw new Error('Reset request failed')
        setNotice('If an account uses that email, a password reset link will arrive shortly.')
        return
      }

      if (mode === 'reset-password') {
        const password = String(formData.get('password') ?? '')
        if (!resetToken) throw new Error('Reset link is missing')
        if (password !== String(formData.get('confirmPassword') ?? '')) {
          setError('Those passwords do not match. Please try again.')
          return
        }
        const result = await authClient.resetPassword({ newPassword: password, token: resetToken })
        if (result.error) throw new Error('Password reset failed')
        router.replace('/')
        router.refresh()
        return
      }

      const username = String(formData.get('username') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      const email = String(formData.get('email') ?? '').trim()
      if (mode === 'sign-up' && !email.toLowerCase().endsWith('@cricketblackbird.com')) {
        setError('Use an @cricketblackbird.com email so account recovery stays within your allowed domain.')
        return
      }
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({
            name: username,
            email,
            username,
            displayUsername: username,
            password,
          })
        : username.includes('@')
          ? await authClient.signIn.email({ email: username, password })
          : await authClient.signIn.username({ username, password })

      if (result.error) throw new Error('Authentication failed')
      router.refresh()
    } catch {
      setError(mode === 'forgot-password' || mode === 'reset-password'
        ? 'We could not complete that request. Check the details or try again shortly.'
        : 'We could not verify those details. Please check them and try again.')
    } finally {
      setBusy(false)
    }
  }

  const isCreatingFirstAccount = allowInitialSignup && mode === 'sign-up'
  const isResetRequest = mode === 'forgot-password'
  const isChoosingPassword = mode === 'reset-password'
  const isSignIn = mode === 'sign-in'
  const hasResetToken = Boolean(resetToken)

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
          <h1 id="auth-title">
            {isCreatingFirstAccount
              ? 'Create your sign-in'
              : isResetRequest
                ? 'Reset your password'
                : isChoosingPassword
                  ? 'Choose a new password'
                  : 'Sign in'}
          </h1>
          <p className="auth-description">
            {isCreatingFirstAccount
              ? 'Set a username and password. Use an @cricketblackbird.com email for password recovery. First-account setup closes after this.'
              : isResetRequest
                ? 'Reset links are only sent to @cricketblackbird.com addresses. If the address is registered, we will send a link.'
                : isChoosingPassword
                  ? 'Choose a new password for your account.'
                  : 'Good to have you back.'}
          </p>

          {isChoosingPassword && !hasResetToken ? (
            <p className="form-error" role="alert">This reset link is missing or expired. Request a new link to continue.</p>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              {isCreatingFirstAccount && (
                <div className="auth-field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" name="email" autoComplete="email" required maxLength={254} />
                </div>
              )}

              {isResetRequest && (
                <div className="auth-field">
                  <label htmlFor="reset-email">Account email</label>
                  <input id="reset-email" type="email" name="email" autoComplete="email" required maxLength={254} />
                </div>
              )}

              {!isResetRequest && !isChoosingPassword && (
                <div className="auth-field">
                  <label htmlFor="username">{isCreatingFirstAccount ? 'Username' : 'Username or email'}</label>
                  <input
                    id="username"
                    type="text"
                    name="username"
                    autoComplete={isCreatingFirstAccount ? 'username' : 'username'}
                    autoCapitalize="none"
                    required
                    minLength={isCreatingFirstAccount ? 3 : 1}
                    maxLength={isCreatingFirstAccount ? 30 : 254}
                    pattern={isCreatingFirstAccount ? '[A-Za-z0-9_.]+' : undefined}
                    title={isCreatingFirstAccount ? 'Use 3–30 letters, numbers, periods, or underscores.' : undefined}
                  />
                </div>
              )}

              {(!isResetRequest && !isChoosingPassword || isChoosingPassword && hasResetToken) && (
                <div className="auth-field">
                  <label htmlFor="password">{isChoosingPassword ? 'New password' : 'Password'}</label>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    autoComplete={isCreatingFirstAccount || isChoosingPassword ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              )}

              {isChoosingPassword && hasResetToken && (
                <div className="auth-field">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              )}

              {error && <p className="form-error" role="alert">{error}</p>}
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              {(!isChoosingPassword || hasResetToken) && (
                <button className="button button-primary auth-submit" type="submit" disabled={busy}>
                  {busy
                    ? 'Please wait…'
                    : isCreatingFirstAccount
                      ? 'CREATE ACCOUNT'
                      : isResetRequest
                        ? 'SEND RESET LINK'
                        : isChoosingPassword
                          ? 'UPDATE PASSWORD'
                          : 'ENTER'}
                </button>
              )}
            </form>
          )}

          {isSignIn && (
            <button className="text-button auth-secondary" type="button" onClick={() => { setError(''); setNotice(''); setMode('forgot-password') }}>
              Forgot password?
            </button>
          )}
          {(isResetRequest || isChoosingPassword) && (
            <button className="text-button auth-secondary" type="button" onClick={() => { setError(''); setNotice(''); setMode('sign-in') }}>
              Back to sign in
            </button>
          )}
          {allowInitialSignup && !isResetRequest && !isChoosingPassword && (
            <button
              className="text-button auth-secondary"
              type="button"
              onClick={() => {
                setError('')
                setNotice('')
                setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')
              }}
            >
              {isCreatingFirstAccount ? 'Back to sign in' : 'Set up the first account'}
            </button>
          )}
        </section>
      </div>
    </main>
  )
}
