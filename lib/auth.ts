import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { username } from 'better-auth/plugins'
import { pool } from '@/lib/db'
import { escapeEmailHtml, isProductionMailEnvironment, MAIL_RECIPIENT, sendOwnerEmail } from '@/lib/email'

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
      if (user.email.trim().toLowerCase() !== MAIL_RECIPIENT) return

      const productionMail = isProductionMailEnvironment()
      const resetMessage = productionMail
        ? `Use this link to choose a new password: ${url}\n\nIf you did not request this, you can ignore this email.`
        : 'A password reset was requested in a non-production environment. The live reset link is intentionally omitted from preview email.'
      const resetHtml = productionMail
        ? `<p>We received a request to reset your password.</p><p><a href="${escapeEmailHtml(url)}">Choose a new password</a></p><p>If you did not request this, you can ignore this email.</p>`
        : '<p>A password reset was requested in a non-production environment.</p><p>The live reset link is intentionally omitted from preview email.</p>'
      const result = await sendOwnerEmail({
        sender: 'security',
        subject: 'Reset your Montemader Defense Command password',
        text: resetMessage,
        html: resetHtml,
        idempotencyKey: `password-reset/${createHash('sha256').update(token).digest('hex')}`,
      })

      if (!result.sent) {
        console.error('[auth] Password reset email delivery failed', {
          reason: result.reason,
          errorName: 'errorName' in result ? result.errorName : undefined,
        })
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
