import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteActivityArchive, getActivityArchive, putActivityArchive } from '@/lib/activity-archive'
import { streamTopics, type ActivityArchiveInput, type BrowserHintSnapshot, type StreamTopic } from '@/lib/activity-archive-types'
import { readJsonBody } from '@/lib/read-json-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const maximumRequestBytes = 64_000
const browserHintKeys = [
  'online', 'visible', 'processorCount', 'approximateMemoryGb', 'connectionType',
  'estimatedDownlinkMbps', 'estimatedRttMs', 'dataSaver', 'checkedAt',
]

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: responseHeaders })
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin'
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function isTopic(value: unknown): value is StreamTopic {
  return typeof value === 'string' && (streamTopics as readonly string[]).includes(value)
}

function numberOrNull(value: unknown, minimum: number, maximum: number, integer = false): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value)))
}

function validateBrowserHints(value: unknown): BrowserHintSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const hints = value as Record<string, unknown>
  if (Object.keys(hints).length !== browserHintKeys.length || !browserHintKeys.every((key) => key in hints)) return null
  if (typeof hints.online !== 'boolean' || typeof hints.visible !== 'boolean') return null
  if (!numberOrNull(hints.processorCount, 1, 1024, true) || !numberOrNull(hints.approximateMemoryGb, 0, 1024)) return null
  if (!numberOrNull(hints.estimatedDownlinkMbps, 0, 100_000) || !numberOrNull(hints.estimatedRttMs, 0, 60_000)) return null
  if (hints.connectionType !== null && (typeof hints.connectionType !== 'string' || hints.connectionType.length > 32 || /[\u0000-\u001f\u007f]/.test(hints.connectionType))) return null
  if (hints.dataSaver !== null && typeof hints.dataSaver !== 'boolean') return null
  if (typeof hints.checkedAt !== 'string' || hints.checkedAt.length > 40 || !Number.isFinite(Date.parse(hints.checkedAt))) return null

  return hints as BrowserHintSnapshot
}

function parseInput(value: unknown): ActivityArchiveInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (body.kind === 'topic_selected' && Object.keys(body).length === 2 && isTopic(body.topic)) {
    return { kind: 'topic_selected', topic: body.topic }
  }
  if (body.kind === 'snapshot' && Object.keys(body).length === 3 && isTopic(body.topic) && typeof body.text === 'string' && body.text.length > 0 && body.text.length <= 20_000) {
    return { kind: 'snapshot', topic: body.topic, text: body.text }
  }
  if (body.kind === 'browser_hints' && Object.keys(body).length === 2) {
    const hints = validateBrowserHints(body.hints)
    if (hints) return { kind: 'browser_hints', hints }
  }
  return null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  try {
    return json(await getActivityArchive(userId))
  } catch {
    return json({ error: 'Private archive is unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Unauthorized' }, 401)
  if (!hasSameOrigin(request)) return json({ error: 'Forbidden' }, 403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'Unsupported content type' }, 415)

  const parsed = await readJsonBody(request, maximumRequestBytes)
  if (!parsed.ok) return json({ error: parsed.status === 413 ? 'Payload too large' : 'Invalid JSON' }, parsed.status)

  const input = parseInput(parsed.value)
  if (!input) return json({ error: 'Invalid archive record' }, 400)

  try {
    await putActivityArchive(userId, input)
    return json({ saved: true }, 201)
  } catch {
    return json({ error: 'Could not save to private archive' }, 503)
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Unauthorized' }, 401)
  if (!hasSameOrigin(request)) return json({ error: 'Forbidden' }, 403)

  try {
    const deleted = await deleteActivityArchive(userId)
    return json({ deleted })
  } catch {
    return json({ error: 'Could not clear private archive' }, 503)
  }
}
