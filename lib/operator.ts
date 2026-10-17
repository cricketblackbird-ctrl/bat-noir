import { and, eq, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { dragonMasterAuthority } from '@/lib/db/schema'

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user
}

export async function claimOrReadMmAuthority(userId: string) {
  await db
    .insert(dragonMasterAuthority)
    .values({ singleton: true, mmUserId: userId })
    .onConflictDoNothing()

  const [authority] = await db
    .select({ mmUserId: dragonMasterAuthority.mmUserId })
    .from(dragonMasterAuthority)
    .where(eq(dragonMasterAuthority.singleton, true))
    .limit(1)

  return authority?.mmUserId === userId
}

export async function requireMm() {
  const user = await requireSession()
  const isMm = await claimOrReadMmAuthority(user.id)
  if (!isMm) throw new Error('Forbidden')
  return user
}

export async function isMmUser(userId: string) {
  const isMm = await claimOrReadMmAuthority(userId)
  if (!isMm) return false

  await db
    .update(dragonMasterAuthority)
    .set({ mmUserId: userId })
    .where(
      and(
        eq(dragonMasterAuthority.singleton, true),
        isNull(dragonMasterAuthority.mmUserId),
      ),
    )

  return true
}
