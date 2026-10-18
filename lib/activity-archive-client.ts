import type { ActivityArchiveInput, ActivityArchiveResponse } from '@/lib/activity-archive-types'

const archiveUrl = '/api/activity-archive'

export async function fetchActivityArchive(url: string): Promise<ActivityArchiveResponse> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Private archive unavailable')
  return response.json() as Promise<ActivityArchiveResponse>
}

export async function saveActivityArchive(input: ActivityArchiveInput) {
  const response = await fetch(archiveUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('Could not save this item to the private archive')
  return response.json() as Promise<{ saved: true }>
}

export async function clearActivityArchive() {
  const response = await fetch(archiveUrl, { method: 'DELETE', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Could not clear the private archive')
  return response.json() as Promise<{ deleted: number }>
}
