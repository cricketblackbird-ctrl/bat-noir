import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userSecretVaults } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const maximumBodyLength = 750_000
const base64UrlPattern = /^[A-Za-z0-9_-]+$/

function isBase64Url(value: unknown, minimumLength: number, maximumLength: number) {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > maximumLength) return false
  if (!base64UrlPattern.test(value)) return false
  return Buffer.from(value, 'base64url').toString('base64url') === value
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders })

  const [vault] = await db
    .select({ salt: userSecretVaults.salt, iv: userSecretVaults.iv, ciphertext: userSecretVaults.ciphertext })
    .from(userSecretVaults)
    .where(eq(userSecretVaults.userId, userId))
    .limit(1)

  return NextResponse.json({ vault: vault ?? null }, { headers: responseHeaders })
}

export async function PUT(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders })
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415, headers: responseHeaders })
  }

  const body = await request.text()
  if (body.length > maximumBodyLength) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers: responseHeaders })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid encrypted vault payload' }, { status: 400, headers: responseHeaders })
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid encrypted vault payload' }, { status: 400, headers: responseHeaders })
  }

  const record = payload as Record<string, unknown>
  const hasExactFields = Object.keys(record).length === 3 && ['salt', 'iv', 'ciphertext'].every((key) => key in record)
  const validParameters = isBase64Url(record.salt, 22, 22) &&
    isBase64Url(record.iv, 16, 16) &&
    isBase64Url(record.ciphertext, 24, maximumBodyLength)

  if (!hasExactFields || !validParameters) {
    return NextResponse.json({ error: 'Invalid encrypted vault payload' }, { status: 400, headers: responseHeaders })
  }

  const vault = {
    userId,
    salt: record.salt as string,
    iv: record.iv as string,
    ciphertext: record.ciphertext as string,
    updatedAt: new Date(),
  }

  await db.insert(userSecretVaults).values(vault).onConflictDoUpdate({
    target: userSecretVaults.userId,
    set: { salt: vault.salt, iv: vault.iv, ciphertext: vault.ciphertext, updatedAt: vault.updatedAt },
  })

  return NextResponse.json({ saved: true }, { headers: responseHeaders })
}
