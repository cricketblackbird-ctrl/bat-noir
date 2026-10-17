import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { AccessGate } from '@/components/access-gate'
import { ControlRoom } from '@/components/control-room'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return <AccessGate />
  const isMm = await claimOrReadMmAuthority(session.user.id)
  return <ControlRoom operator={{ name: session.user.name, email: session.user.email, isMm }} />
}
