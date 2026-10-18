import * as jose from 'jose'

const issuerUrl = 'https://oidc.vercel.com/cricketblackbird-4588'
const jwks = jose.createRemoteJWKSet(new URL(`${issuerUrl}/.well-known/jwks`))

export async function verifyIncomingOidcToken(authHeader: string | null) {
  const token = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new Error('Missing authorization bearer token')

  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: issuerUrl,
    audience: 'https://montemader.com/telemetry',
    subject: 'owner:cricketblackbird-4588:project:bat-noir:environment:preview',
  })

  return payload
}
