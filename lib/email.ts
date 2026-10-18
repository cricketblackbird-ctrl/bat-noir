import 'server-only'

import { Resend } from 'resend'

export const MAIL_RECIPIENT = 'cricketblackbird@gmail.com'

export function isProductionMailEnvironment() {
  return process.env.VERCEL_ENV === 'production'
}

export function getTransactionalEmailRouting() {
  const production = isProductionMailEnvironment()
  const emailDomain = process.env.RESEND_EMAIL_DOMAIN
  const validEmailDomain = emailDomain && /^[a-zA-Z0-9.-]+$/.test(emailDomain)

  return {
    environment: production ? 'production' as const : 'non-production' as const,
    recipient: production ? MAIL_RECIPIENT : 'delivered@resend.dev',
    senders: production && validEmailDomain
      ? [`security@${emailDomain}`, `alerts@${emailDomain}`]
      : ['onboarding@resend.dev'],
    customDomainConfigured: Boolean(validEmailDomain),
  }
}

export function isOwnerEmailConfigured() {
  const routing = getTransactionalEmailRouting()
  return Boolean(
    process.env.RESEND_API_KEY &&
    (routing.environment !== 'production' || routing.customDomainConfigured),
  )
}

export type TransactionalEmail = {
  sender: 'security' | 'alerts'
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

  const routing = getTransactionalEmailRouting()
  const productionMail = routing.environment === 'production'
  const validEmailDomain = emailDomain && /^[a-zA-Z0-9.-]+$/.test(emailDomain)

  if (!apiKey || (productionMail && !validEmailDomain)) {
    return { sent: false as const, reason: 'not_configured' as const }
  }

  try {
    const { data, error } = await new Resend(apiKey).emails.send(
      {
        from: productionMail
          ? `Montemader ${email.sender === 'alerts' ? 'Alerts' : 'Security'} <${email.sender}@${emailDomain}>`
          : 'Montemader Preview <onboarding@resend.dev>',
        to: [routing.recipient],
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
