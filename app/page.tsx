import { count } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AccessGate } from '@/components/access-gate'
import { ControlRoom } from '@/components/control-room'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    const [accountCount] = await db.select({ total: count() }).from(user)
    return (
      <AccessGate
        allowInitialSignup={process.env.NODE_ENV === 'development' && (accountCount?.total ?? 0) === 0}
      />
    )
  }
  const isMm = await claimOrReadMmAuthority(session.user.id)
  return <ControlRoom operator={{ id: session.user.id, isMm }} />
}
