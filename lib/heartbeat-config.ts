import { SITE_SCOPE } from '@/lib/site-scope'

export const HEARTBEAT_CONFIG = {
  pollIntervalMs: 5_000,
  maxHeartbeatAgeSec: 32,
  siteScope: SITE_SCOPE,
  activeWatchers: ['ruach', 'xena', 'superbot'] as const,
}
