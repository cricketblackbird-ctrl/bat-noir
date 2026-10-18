import { AccessGate } from '@/components/access-gate'

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  const token = Array.isArray(params.token) ? params.token[0] : params.token

  return <AccessGate allowInitialSignup={false} resetToken={token} />
}
