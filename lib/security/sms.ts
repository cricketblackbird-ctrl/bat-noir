import { getToken } from '@vercel/connect'

const twilioConnector = 'cloudflare'
const recipient = '+14258303312'

export async function sendEmergencySms(body: string): Promise<{ sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !apiKeySid || !messagingServiceSid) {
    throw new Error('SMS configuration is incomplete.')
  }

  const apiKeySecret = await getToken(twilioConnector, { subject: { type: 'app' } })
  const authorization = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')
  const form = new URLSearchParams({
    To: recipient,
    MessagingServiceSid: messagingServiceSid,
    Body: body,
  })
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  const result = await response.json().catch(() => null) as { sid?: string } | null
  if (!response.ok || typeof result?.sid !== 'string') {
    throw new Error(`SMS provider returned HTTP ${response.status}.`)
  }
  return { sid: result.sid }
}

export const SECURITY_TEST_MESSAGE = 'emergency site attack'
