import { timingSafeEqual } from 'node:crypto'

export function hasCronAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization') ?? ''
  const expected = secret ? `Bearer ${secret}` : ''
  const actualBuffer = Buffer.from(authorization)
  const expectedBuffer = Buffer.from(expected)
  return Boolean(secret && actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer))
}
