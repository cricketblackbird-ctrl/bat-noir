import { generateText } from 'ai'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return Response.json(
      { error: 'Sign in to create a holiday.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    const { text } = await generateText({
      model: 'moonshotai/kimi-k3',
      prompt: 'Invent a brand new holiday and describe its core traditions, celebration rituals, and festive foods. Make it joyful, imaginative, culturally respectful, and concise. Give the holiday a memorable name, explain when it is celebrated, describe two or three core traditions and one shared celebration ritual, and suggest two or three festive foods. Use clear section headings and plain text.',
      maxOutputTokens: 600,
    })

    if (!text.trim()) {
      return Response.json(
        { error: 'The holiday generator returned an empty idea. Please try again.' },
        { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    return Response.json(
      { holiday: text.trim() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Holiday generation is temporarily unavailable. Please try again.' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
