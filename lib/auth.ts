import { createHash } from 'node:crypto'
import { Resend } from 'resend'
import { betterAuth } from 'better-auth'
import { username } from 'better-auth/plugins'
import { pool } from '@/lib/db'

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character)
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    disableSignUp: process.env.NODE_ENV !== 'development',
    sendResetPassword: async ({ user, url, token }) => {
      const recipient = user.email.trim().toLowerCase()
      if (!recipient.endsWith('@cricketblackbird.com')) return

      const apiKey = process.env.RESEND_API_KEY
      const emailDomain = process.env.RESEND_EMAIL_DOMAIN
      if (!apiKey || !emailDomain) {
        console.error('[auth] Password reset email is not configured')
        throw new Error('Password reset email unavailable')
      }

      const resend = new Resend(apiKey)
      const safeUrl = escapeHtml(url)
      const { error } = await resend.emails.send(
        {
          from: `Montemader Defense Command <no-reply@${emailDomain}>`,
          to: [user.email],
          subject: 'Reset your Montemader Defense Command password',
          text: `Use this link to choose a new password: ${url}\n\nIf you did not request this, you can ignore this email.`,
          html: `<p>We received a request to reset your password.</p><p><a href="${safeUrl}">Choose a new password</a></p><p>If you did not request this, you can ignore this email.</p>`,
        },
        { idempotencyKey: `password-reset/${createHash('sha256').update(token).digest('hex')}` },
      )

      if (error) {
        console.error('[auth] Password reset email delivery failed', { errorName: error.name })
        throw new Error('Password reset email unavailable')
      }
    },
  },
  plugins: [username()],
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
