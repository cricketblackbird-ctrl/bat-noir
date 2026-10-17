import { timingSafeEqual } from 'node:crypto'

export type FighterId = 'ruach' | 'xena' | 'superbot'

const tokenNames: Record<FighterId, string> = {
  ruach: 'DRAGON_RUACH_TOKEN',
  xena: 'DRAGON_XENA_TOKEN',
  superbot: 'DRAGON_SUPERBOT_TOKEN',
}

export function normalizeFighterId(value: string): FighterId | null {
  const normalized = value.toLowerCase()
  if (normalized === 'zena') return 'xena'
  return normalized === 'ruach' || normalized === 'xena' || normalized === 'superbot'
    ? normalized
    : null
}

export function authorizeFighter(request: Request, value: string): FighterId | null {
  const fighterId = normalizeFighterId(value)
  if (!fighterId) return null

  const secret = process.env[tokenNames[fighterId]]
  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer ([^\s]+)$/i)
  if (!secret || !match) return null

  const expected = Buffer.from(secret, 'utf8')
  const candidate = Buffer.from(match[1], 'utf8')
  if (candidate.byteLength !== expected.byteLength) return null

  return timingSafeEqual(candidate, expected) ? fighterId : null
}
