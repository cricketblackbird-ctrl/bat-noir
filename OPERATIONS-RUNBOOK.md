# Master Control Suite recovery notes

This runbook records how the usage panel is connected, where its credentials are configured, and the firewall IP rules supplied for the Vercel project. It deliberately contains no credential values.

## Usage panel: how it is wired

- The deployed page is `https://mastercontrolsuite.vercel.app`.
- The authenticated usage panel is rendered by `components/vercel-usage-panel.tsx` and calls `GET /api/vercel-usage`.
- The route in `app/api/vercel-usage/route.ts` reads Vercel data server-side. It requests project Web Analytics grouped by path and team billing charges for the current UTC month to date.
- The route requires an authenticated session and the authorized operator. Responses are private and not cached. The Vercel token is never sent to the browser.
- The panel includes links to Vercel Usage and project Analytics, along with its own source/range disclosure.

## Credential recovery

1. In Vercel, open the `master_control_suite` project and select **Settings → Environment Variables** (or **Vars** in the v0 project settings).
2. Set `VERCEL_API_TOKEN` for each environment where this panel should run. Do not put the token in source code, this document, browser code, or a chat message.
3. Use a valid Vercel token whose owner has access to team `cricketblackbird-4588`, the project’s Web Analytics, and team billing charges. A variable being present does not prove the token is valid or sufficiently authorized.
4. Redeploy after changing the variable, then sign in as the authorized operator and reload the page.
5. If the panel still reports HTTP 401/403, create or select a valid token with the required team access, update the Vercel variable, and redeploy. Do not work around the operator check or expose the token to the client.

**Last observed status:** the variable was present in the project runtime, but calls to both Vercel endpoints returned HTTP 403 (`invalidToken`). No live analytics or billing values were confirmed at that time. Recheck after replacing the token; do not treat an unavailable value as zero.

## Firewall IP Access Rules

These are the rule details supplied for documentation. They have **not** been verified against or applied to Vercel Firewall settings by this code change.

| IP Address / CIDR | Action | Note / Reason |
| --- | --- | --- |
| `198.51.100.42` | Block | Repeated brute force attempt |
| `203.0.113.12` | Allow | Master Admin Static Office IP |

**Important:** both addresses belong to IPv4 ranges reserved for documentation examples (TEST-NET-2 and TEST-NET-3). They are not usable public office/source addresses. Before creating rules in Vercel, replace them with the actual IP address or CIDR confirmed by the operator. In particular, validate the allowlisted office address out of band to avoid locking out legitimate access. Firewall rules are managed in the Vercel project’s Firewall settings; this application runbook does not change them.

## Change record

- The page usage panel and source notes were added in commit `c2f0001` on branch `v0/mm-live-rules-readability`.
- The application provides a read-only view of Vercel usage data; credentials and firewall configuration remain managed in Vercel project settings.
