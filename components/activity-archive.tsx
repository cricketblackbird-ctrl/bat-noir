'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { clearActivityArchive, fetchActivityArchive } from '@/lib/activity-archive-client'
import type { ActivityArchiveRecord } from '@/lib/activity-archive-types'
import { formatCentralTime } from '@/lib/format-time'

const topicNames: Record<string, string> = {
  all: 'All live data',
  website: 'Website & audience',
  health: 'Health & listening',
  safety: 'Safety & listening',
  security: 'Security signals',
  clarity: 'Clarity & freshness',
}

function titleFor(record: ActivityArchiveRecord) {
  if (record.kind === 'topic_selected') return `Stream filter · ${topicNames[record.topic]}`
  if (record.kind === 'snapshot') return `Captured snapshot · ${topicNames[record.topic]}`
  return 'Browser hints · saved by request'
}

function contentFor(record: ActivityArchiveRecord) {
  if (record.kind === 'snapshot') return record.text
  if (record.kind === 'topic_selected') return `Selected stream filter: ${topicNames[record.topic]}`
  return JSON.stringify(record.hints, null, 2)
}

export function ActivityArchivePanel() {
  const { data, error, isLoading, mutate } = useSWR('/api/activity-archive', fetchActivityArchive, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function onClearArchive() {
    if (!window.confirm('Delete every archived stream selection, captured snapshot, and browser-hint record for this account?')) return
    setBusy(true)
    setNotice('')
    try {
      await clearActivityArchive()
      await mutate({ items: [], total: 0 }, false)
      setNotice('Private archive cleared.')
    } catch {
      setNotice('The archive could not be cleared. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel activity-archive-panel" aria-labelledby="activity-archive-heading">
      <div className="panel-heading">
        <div><p className="section-kicker">PRIVATE R2 STORAGE · ACCOUNT-SCOPED</p><h2 id="activity-archive-heading">Captured information archive</h2></div>
        <span className="archive-total">{data ? `${data.total} / 200` : 'R2'}</span>
      </div>
      <p className="archive-description">Stream filter choices and snapshots are saved when you use the tester. Browser hints are saved only when you choose Save browser snapshot. Records are private to your signed-in account; the archive keeps the latest 200 items.</p>
      {error ? <p className="archive-state" role="status">Private R2 archive is unavailable. New captures remain in this tab only until storage is available.</p>
        : isLoading || !data ? <p className="archive-state" role="status">Loading private archive…</p>
          : data.items.length === 0 ? <p className="archive-state">No records saved yet. Use the tester capture controls or save a browser snapshot.</p>
            : <ol className="archive-list">{data.items.map((record) => <li key={record.id}>
              <details>
                <summary><span>{titleFor(record)}</span><time dateTime={record.createdAt}>{formatCentralTime(record.createdAt)}</time></summary>
                <pre>{contentFor(record)}</pre>
              </details>
            </li>)}</ol>}
      <div className="archive-actions">
        <button className="text-button" type="button" onClick={() => void mutate()} disabled={busy || isLoading}>Refresh archive</button>
        <button className="text-button archive-clear" type="button" onClick={() => void onClearArchive()} disabled={busy || !data?.total}>{busy ? 'Clearing…' : 'Delete all archived records'}</button>
      </div>
      <p className="archive-notice" role="status" aria-live="polite">{notice}</p>
    </section>
  )
}
