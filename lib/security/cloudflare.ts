import { getToken } from '@vercel/connect'
import { SITE_SCOPE } from '@/lib/site-scope'

const cloudflareConnector = 'cloudflare/montemader-security-telemetry'
const blockedActions = new Set(['block'])
const challengedActions = new Set(['challenge', 'jschallenge', 'managed_challenge'])

type FirewallGroup = {
  count: number
  dimensions: { action: string; source: string; clientCountryName: string }
}

type RequestGroup = {
  sum: { requests: number; bytes: number; cachedRequests: number; threats: number }
}

type CloudflareGraphqlResponse = {
  errors?: Array<{ message?: string }>
  data?: {
    viewer?: {
      zones?: Array<{
        httpRequests1hGroups?: RequestGroup[]
        firewallEventsAdaptiveGroups?: FirewallGroup[]
      }>
    }
  }
}

export type CloudflareSnapshot = {
  capturedAt: string
  requests24h: number
  bytes24h: number
  cachedRequests24h: number
  threatRequests24h: number
  blockedOrChallenged60s: number
  blocked60s: number
  challenged60s: number
  threshold: number
  thresholdMet: boolean
  firewallActions: Array<{ action: string; source: string; count: number }>
  countries: Array<{ country: string; count: number }>
}

export async function getCloudflareSnapshot(now = new Date()): Promise<CloudflareSnapshot> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  if (!zoneId) throw new Error('Cloudflare zone is not configured.')

  const token = await getToken(cloudflareConnector, {
    subject: { type: 'app' },
  })

  const recent = new Date(now.getTime() - 60_000).toISOString()
  const day = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  const query = `query SecuritySnapshot {
    viewer {
      zones(filter: { zoneTag: ${JSON.stringify(zoneId)} }) {
        httpRequests1hGroups(limit: 48, filter: { datetime_geq: ${JSON.stringify(day)} }) {
          sum { requests bytes cachedRequests threats }
        }
        firewallEventsAdaptiveGroups(limit: 100, filter: { datetime_geq: ${JSON.stringify(recent)} }) {
          dimensions { action source clientCountryName }
          count
        }
      }
    }
  }`

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Cloudflare analytics returned HTTP ${response.status}.`)

  const result = await response.json() as CloudflareGraphqlResponse
  if (result.errors?.length) throw new Error('Cloudflare analytics rejected the security query.')
  const zone = result.data?.viewer?.zones?.[0]
  if (!zone) throw new Error('Cloudflare returned no analytics for the configured zone.')

  const requestGroups = zone.httpRequests1hGroups ?? []
  const firewallGroups = zone.firewallEventsAdaptiveGroups ?? []
  const blocked60s = firewallGroups.reduce((total, group) =>
    total + (blockedActions.has(group.dimensions.action.toLowerCase()) ? group.count : 0), 0)
  const challenged60s = firewallGroups.reduce((total, group) =>
    total + (challengedActions.has(group.dimensions.action.toLowerCase()) ? group.count : 0), 0)
  const byAction = new Map<string, number>()
  const byCountry = new Map<string, number>()
  for (const group of firewallGroups) {
    const action = group.dimensions.action.toLowerCase()
    const source = group.dimensions.source || 'unknown'
    const key = `${action}\u0000${source}`
    byAction.set(key, (byAction.get(key) ?? 0) + group.count)
    const country = group.dimensions.clientCountryName || 'Unknown'
    byCountry.set(country, (byCountry.get(country) ?? 0) + group.count)
  }

  const blockedOrChallenged60s = blocked60s + challenged60s
  const threshold = 20
  return {
    capturedAt: now.toISOString(),
    requests24h: requestGroups.reduce((total, group) => total + (group.sum?.requests ?? 0), 0),
    bytes24h: requestGroups.reduce((total, group) => total + (group.sum?.bytes ?? 0), 0),
    cachedRequests24h: requestGroups.reduce((total, group) => total + (group.sum?.cachedRequests ?? 0), 0),
    threatRequests24h: requestGroups.reduce((total, group) => total + (group.sum?.threats ?? 0), 0),
    blockedOrChallenged60s,
    blocked60s,
    challenged60s,
    threshold,
    thresholdMet: blockedOrChallenged60s >= threshold,
    firewallActions: [...byAction.entries()]
      .map(([key, count]) => {
        const [action, source] = key.split('\u0000')
        return { action, source, count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    countries: [...byCountry.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }
}

export function getMonitoredSiteUrl() {
  return `https://${SITE_SCOPE}`
}
