import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { TelemetryDiagnostics } from '@/components/telemetry-diagnostics'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Telemetry Diagnostics',
  description: 'Authenticated connection checks for security and telemetry endpoints.',
}

export default async function DiagnosticsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/')

  return <TelemetryDiagnostics operatorName={session.user.name || 'signed-in operator'} />
}
