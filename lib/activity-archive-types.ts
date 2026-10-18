export const streamTopics = ['all', 'website', 'health', 'safety', 'security', 'clarity'] as const

export type StreamTopic = (typeof streamTopics)[number]

export type BrowserHintSnapshot = {
  online: boolean
  visible: boolean
  processorCount: number | null
  approximateMemoryGb: number | null
  connectionType: string | null
  estimatedDownlinkMbps: number | null
  estimatedRttMs: number | null
  dataSaver: boolean | null
  checkedAt: string
}

export type ActivityArchiveInput =
  | { kind: 'topic_selected'; topic: StreamTopic }
  | { kind: 'snapshot'; topic: StreamTopic; text: string }
  | { kind: 'browser_hints'; hints: BrowserHintSnapshot }

export type ActivityArchiveRecord = ActivityArchiveInput & {
  id: string
  createdAt: string
}

export type ActivityArchiveResponse = {
  items: ActivityArchiveRecord[]
  total: number
}
