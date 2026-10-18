import 'server-only'

import { Resend } from 'resend'

export const MAIL_RECIPIENT = 'cricketblackbird@gmail.com'

export function isOwnerEmailConfigured() {
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN
  return Boolean(
    process.env.RESEND_API_KEY &&
    emailDomain &&
    /^[a-zA-Z0-9.-]+$/.test(emailDomain),
  )
}

export type TransactionalEmail = {
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export function escapeEmailHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character)
}

export async function sendOwnerEmail(email: TransactionalEmail) {
  const apiKey = process.env.RESEND_API_KEY
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN

  if (!apiKey || !emailDomain || !/^[a-zA-Z0-9.-]+$/.test(emailDomain)) {
    return { sent: false as const, reason: 'not_configured' as const }
  }

  try {
    const { data, error } = await new Resend(apiKey).emails.send(
      {
        from: `Montemader Defense Command <no-reply@${emailDomain}>`,
        to: [MAIL_RECIPIENT],
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
      { idempotencyKey: email.idempotencyKey },
    )

    if (error) {
      return { sent: false as const, reason: 'provider_error' as const, errorName: error.name }
    }

    return { sent: true as const, id: data?.id ?? null }
  } catch {
    return { sent: false as const, reason: 'provider_error' as const }
  }
}
