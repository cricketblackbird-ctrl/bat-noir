import { count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

export const runtime = 'nodejs'

const authHandlers = toNextJsHandler(auth)

export const GET = authHandlers.GET

export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith('/sign-up/email')) {
    if (process.env.NODE_ENV !== 'development') {
      return Response.json({ message: 'Account setup is unavailable.' }, { status: 403 })
    }

    const body = await request.clone().json().catch(() => null)
    const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : ''
    if (email !== 'cricketblackbird@gmail.com') {
      return Response.json({ message: 'Use the configured account email.' }, { status: 400 })
    }

    const [accountCount] = await db.select({ total: count() }).from(user)
    if ((accountCount?.total ?? 0) > 0) {
      return Response.json({ message: 'Initial account setup is closed.' }, { status: 403 })
    }
  }

  return authHandlers.POST(request)
}
