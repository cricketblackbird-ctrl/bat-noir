import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AccessGate } from '@/components/access-gate'
import { ControlRoom } from '@/components/control-room'
import { db } from '@/lib/db'
import { dragonMasterAuthority } from '@/lib/db/schema'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    const [authority] = await db.select({ mmUserId: dragonMasterAuthority.mmUserId })
      .from(dragonMasterAuthority)
      .where(eq(dragonMasterAuthority.singleton, true))
      .limit(1)
    return <AccessGate allowInitialSignup={!authority?.mmUserId} />
  }
  const isMm = await claimOrReadMmAuthority(session.user.id)
  return <ControlRoom operator={{ name: session.user.name, email: session.user.email, isMm }} />
}
