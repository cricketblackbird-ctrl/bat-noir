import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { dragonMasterAuthority } from '@/lib/db/schema'

export const runtime = 'nodejs'

const authHandlers = toNextJsHandler(auth)
export const GET = authHandlers.GET

export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith('/sign-up/email')) {
    const [authority] = await db.select({ mmUserId: dragonMasterAuthority.mmUserId })
      .from(dragonMasterAuthority)
      .where(eq(dragonMasterAuthority.singleton, true))
      .limit(1)
    if (authority?.mmUserId) {
      return NextResponse.json({ message: 'Initial MM registration is already complete.' }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  return authHandlers.POST(request)
}
