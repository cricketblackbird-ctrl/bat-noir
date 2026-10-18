# Master Control Suite recovery notes

This runbook records the dashboard’s analytics source, Cloudflare/DNS observations, and the firewall IP rules supplied for the Vercel project. It deliberately contains no credential values.

## Analytics source

- The authenticated dashboard reads Cloudflare zone aggregates through `GET /api/security/health`.
- Cloudflare requests are made server-side; responses are private and not cached. The dashboard does not archive these analytics results.
- Vercel Web Analytics, Vercel billing/usage API calls, and the Vercel Analytics browser tracker are not used by the app.
- Cloudflare data is fetched on demand for the signed-in dashboard; the app writes no copy to Vercel Analytics or its history database. Because the app is hosted on Vercel, its server runtime still handles each response in transit.

## Domain DNS and Cloudflare edge

The operator supplied a `dig montemader.com` answer showing two A records with a 300-second TTL:

| Host | Type | Value | TTL |
| --- | --- | --- | --- |
| `montemader.com` | A | `104.21.52.12` | 300 seconds |
| `montemader.com` | A | `172.67.180.44` | 300 seconds |

These are Cloudflare proxy/anycast addresses, consistent with the domain being proxied through Cloudflare. This confirms the DNS answer observed in that capture; by itself, it does not establish that the origin is healthy, the desired Vercel route is configured, or that firewall rules permit the intended traffic. Verify those independently with an HTTPS response and the relevant Cloudflare/Vercel domain and firewall configuration. The capture was supplied in chat, so its observation time and resolver were not independently recorded here.

## Latest independent verification

Checks run on 2026-10-18:

- Cloudflare API inspection was attempted after the operator approved restoration. The configured `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` values are placeholder-like and cannot identify/query the domain zone. No Cloudflare API changes, registrar changes, or DNS edits were made. To continue, replace both values in project Settings → Vars with a real scoped API token and the actual zone ID; do not share either value in chat.

- The operator-provided DNS capture earlier in chat showed `104.21.52.12` and `172.67.180.44`; that capture's time and resolver are unknown.
- A fresh lookup from this environment and independent Google and Cloudflare DNS-over-HTTPS resolvers returned only `162.254.39.118` for `montemader.com`. The current delegated nameservers resolved to `dns1.namecheaphosting.com` and `dns2.namecheaphosting.com`.
- HTTPS HEAD requests returned `200` for both `https://montemader.com` and `https://mastercontrolsuite.vercel.app`. The former identified a LiteSpeed/WordPress response; the latter is a Vercel response.
- The former `/api/vercel-usage` endpoint has been removed. Cloudflare aggregate analytics are served through the authenticated `/api/security/health` route.

**Recovery caution:** do not set `104.21.52.12` and `172.67.180.44` as ordinary A records at Namecheap. Those are Cloudflare proxy IPs, not the site origin, and the current delegation is not to Cloudflare. To restore Cloudflare proxying, first confirm the correct Cloudflare zone, assigned Cloudflare nameservers, and the actual origin record; then update registrar delegation and proxy settings through the authoritative account. No DNS or registrar changes were made during these checks.

## Existing data persistence and new intake

The live Neon schema contains `dragon_telemetry_records`, `telemetry_events`, `platform_metrics`, `magic_dragon_insights`, `security_alert_incidents`, `dragon_rule_revisions`, `dns_history`, and `dns_monitor_settings`. The Cloudflare panel continues to fetch aggregate zone analytics on demand; those results are not archived as history.

The protected DNS history panel checks `montemader.com` A records and nameservers with the server resolver about once a minute while the signed-in operator has the panel open and capture is enabled. It stores no visitor IPs or WAF events, never changes DNS or firewall settings, and retains at most 500 timestamped checks per hostname. The toggle persists in `dns_monitor_settings`; DNS answers and resolver status are in `dns_history`. New checks are rate-limited to one per minute per hostname.

## Firewall IP Access Rules

These are the rule details supplied for documentation. They have **not** been verified against or applied to Vercel Firewall settings by this code change.

| IP Address / CIDR | Action | Note / Reason |
| --- | --- | --- |
| `198.51.100.42` | Block | Repeated brute force attempt |
| `203.0.113.12` | Allow | Master Admin Static Office IP |

**Important:** both addresses belong to IPv4 ranges reserved for documentation examples (TEST-NET-2 and TEST-NET-3). They are not usable public office/source addresses. Before creating rules in Vercel, replace them with the actual IP address or CIDR confirmed by the operator. In particular, validate the allowlisted office address out of band to avoid locking out legitimate access. Firewall rules are managed in the Vercel project’s Firewall settings; this application runbook does not change them.

## Change record

- The former Vercel usage panel was added in commit `c2f0001` on branch `v0/mm-live-rules-readability` and has since been removed from the app.
- The application now reads Cloudflare aggregate analytics on demand; it does not use Vercel Web Analytics, billing, usage, or the browser analytics tracker.
