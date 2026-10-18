import { createHash, randomUUID } from 'node:crypto'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  defaultActivityArchivePageSize,
  type ActivityArchivePageSize,
  type ActivityArchiveRecord,
} from '@/lib/activity-archive-types'

const maxRecordsPerUser = 200
const archivePrefix = 'private-activity'
let client: S3Client | null = null

function getStorage() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET_NAME?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error('Private archive is not configured')

  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  return { client, bucket }
}

function userPrefix(userId: string) {
  const digest = createHash('sha256').update(userId).digest('hex')
  return `${archivePrefix}/${digest}/`
}

async function listUserObjects(userId: string) {
  const { client: storage, bucket } = getStorage()
  const result = await storage.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: userPrefix(userId),
    MaxKeys: 1000,
  }))
  return result.Contents ?? []
}

function isArchiveRecord(value: unknown): value is ActivityArchiveRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' &&
    typeof record.createdAt === 'string' &&
    (record.kind === 'topic_selected' || record.kind === 'snapshot' || record.kind === 'browser_hints')
}

export async function getActivityArchive(userId: string, limit: ActivityArchivePageSize = defaultActivityArchivePageSize) {
  const objects = (await listUserObjects(userId)).filter((object) => object.Key)
  objects.sort((a, b) => (b.Key ?? '').localeCompare(a.Key ?? ''))
  const { client: storage, bucket } = getStorage()
  const newest = objects.slice(0, limit)
  const items = await Promise.all(newest.map(async (object) => {
    try {
      const result = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }))
      const text = await result.Body?.transformToString()
      if (!text) return null
      const record: unknown = JSON.parse(text)
      return isArchiveRecord(record) ? record : null
    } catch {
      return null
    }
  }))

  return {
    items: items.filter((item): item is ActivityArchiveRecord => item !== null),
    total: objects.length,
  }
}

export async function putActivityArchive(userId: string, record: Omit<ActivityArchiveRecord, 'id' | 'createdAt'>) {
  const { client: storage, bucket } = getStorage()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const entry = { ...record, id, createdAt } as ActivityArchiveRecord
  const key = `${userPrefix(userId)}${Date.now().toString().padStart(13, '0')}-${id}.json`

  await storage.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(entry),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'private, no-store',
  }))

  const objects = (await listUserObjects(userId)).filter((object) => object.Key)
  if (objects.length > maxRecordsPerUser) {
    objects.sort((a, b) => (a.Key ?? '').localeCompare(b.Key ?? ''))
    const expired = objects.slice(0, objects.length - maxRecordsPerUser)
    await storage.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Quiet: true, Objects: expired.flatMap((object) => object.Key ? [{ Key: object.Key }] : []) },
    }))
  }

  return entry
}

export async function deleteActivityArchive(userId: string) {
  const { client: storage, bucket } = getStorage()
  const objects = (await listUserObjects(userId)).filter((object) => object.Key)
  if (objects.length) {
    await storage.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Quiet: true, Objects: objects.flatMap((object) => object.Key ? [{ Key: object.Key }] : []) },
    }))
  }
  return objects.length
}
