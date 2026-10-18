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
        if (email.toLowerCase() !== 'cricketblackbird@gmail.com') {
          setError('Use cricketblackbird@gmail.com for password recovery.')
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

      const key = String(formData.get('key') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({
            name: key,
            email: 'cricketblackbird@gmail.com',
            username: key,
            displayUsername: key,
            password,
          })
        : await authClient.signIn.username({ username: key, password })

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
  const hasResetToken = Boolean(resetToken)
  const authTabs: { id: AccessMode; label: string }[] = [
    { id: 'sign-in', label: 'Sign in' },
    ...(allowInitialSignup ? [{ id: 'sign-up' as const, label: 'Create key' }] : []),
    { id: 'forgot-password', label: 'Reset password' },
  ]

  function selectMode(nextMode: AccessMode) {
    setError('')
    setNotice('')
    setMode(nextMode)
  }

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
              ? 'The first key opens the door. Choose it carefully; this entry seals after setup.'
              : isResetRequest
                ? 'Reset links are sent only to cricketblackbird@gmail.com, and only if an account is registered with it.'
                : isChoosingPassword
                  ? 'Choose a new password for your account.'
                  : 'Good to have you back.'}
          </p>

          {!isChoosingPassword && (
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              {authTabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`auth-tab-${tab.id}`}
                  className="auth-tab"
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  aria-controls="auth-tab-panel"
                  tabIndex={mode === tab.id ? 0 : -1}
                  onClick={() => selectMode(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    const tabs = Array.from(
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
                    )
                    const currentIndex = tabs.indexOf(event.currentTarget)
                    const offset = event.key === 'ArrowRight' ? 1 : -1
                    const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length]
                    nextTab?.focus()
                    nextTab?.click()
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {isResetRequest && (
            <p className="auth-recovery-help">
              A reset link is available after your first key is created. If you have not set it up yet, choose Create key above.
            </p>
          )}

          {isChoosingPassword && !hasResetToken ? (
            <p className="form-error" role="alert">This reset link is missing or expired. Request a new link to continue.</p>
          ) : (
            <form
              className="auth-form"
              onSubmit={submit}
              role={isChoosingPassword ? undefined : 'tabpanel'}
              id={isChoosingPassword ? undefined : 'auth-tab-panel'}
              aria-labelledby={isChoosingPassword ? undefined : `auth-tab-${mode}`}
              tabIndex={isChoosingPassword ? undefined : 0}
            >
              {isResetRequest && (
                <div className="auth-field">
                  <label htmlFor="reset-email">Account email</label>
                  <input id="reset-email" type="email" name="email" autoComplete="email" required maxLength={254} defaultValue="cricketblackbird@gmail.com" />
                </div>
              )}

              {!isResetRequest && !isChoosingPassword && (
                <div className="auth-field">
                  <label htmlFor="key">Key</label>
                  <input
                    id="key"
                    type="text"
                    name="key"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    minLength={isCreatingFirstAccount ? 3 : 1}
                    maxLength={30}
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

          {isChoosingPassword && (
            <button className="text-button auth-secondary" type="button" onClick={() => selectMode('sign-in')}>
              Back to sign in
            </button>
          )}
        </section>
      </div>
    </main>
  )
}
