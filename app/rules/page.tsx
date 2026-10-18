import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { DragonRulesPage } from '@/components/dragon-rules-page'
import { auth } from '@/lib/auth'
import { claimOrReadMmAuthority } from '@/lib/operator'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Rules & reports | Defense Command Grid',
  description: 'Versioned, operator-managed rules and authenticated status reports for Ruach, Xena, and SuperBot.',
}

export default async function RulesPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/')
  const isMm = await claimOrReadMmAuthority(session.user.id)

  return <DragonRulesPage operator={{ name: session.user.name, isMm }} />
}
