import { timingSafeEqual } from 'node:crypto'

export type FighterId = 'ruach' | 'xena' | 'superbot'

const tokenNames: Record<FighterId, string> = {
  ruach: 'DRAGON_RUACH_TOKEN',
  xena: 'DRAGON_XENA_TOKEN',
  superbot: 'DRAGON_SUPERBOT_TOKEN',
}
const fighterIds: FighterId[] = ['ruach', 'xena', 'superbot']

export function normalizeFighterId(value: string): FighterId | null {
  const normalized = value.toLowerCase()
  if (normalized === 'zena') return 'xena'
  return normalized === 'ruach' || normalized === 'xena' || normalized === 'superbot'
    ? normalized
    : null
}

export function fighterStorageId(fighterId: FighterId) {
  return fighterId === 'xena' ? 'zena' : fighterId
}

export function getFighterCredentialStatus(fighterId: FighterId) {
  const secret = process.env[tokenNames[fighterId]]
  if (!secret) return 'missing'

  const expected = Buffer.from(secret, 'utf8')
  const sharesCredential = fighterIds.some((otherId) => {
    if (otherId === fighterId) return false
    const otherSecret = process.env[tokenNames[otherId]]
    if (!otherSecret) return false
    const candidate = Buffer.from(otherSecret, 'utf8')
    return candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected)
  })

  return sharesCredential ? 'shared · rejected' : 'isolated API credential'
}

export function authorizeFighter(request: Request, value: string): FighterId | null {
  const fighterId = normalizeFighterId(value)
  if (!fighterId || getFighterCredentialStatus(fighterId) !== 'isolated API credential') return null

  const secret = process.env[tokenNames[fighterId]]
  const match = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)
  if (!secret || !match) return null

  const expected = Buffer.from(secret, 'utf8')
  const candidate = Buffer.from(match[1], 'utf8')
  if (candidate.byteLength !== expected.byteLength) return null

  return timingSafeEqual(candidate, expected) ? fighterId : null
}
