const dnsRecords = [
  {
    type: 'A',
    name: 'montemader.com',
    content: '192.0.2.14',
    proxyStatus: 'Proxied',
    ttl: 'Auto',
  },
  {
    type: 'CNAME',
    name: 'www',
    content: 'montemader.com',
    proxyStatus: 'Proxied',
    ttl: 'Auto',
  },
  {
    type: 'MX',
    name: 'montemader.com',
    content: 'mail.montemader.com',
    proxyStatus: 'DNS Only',
    ttl: 'Auto',
  },
  {
    type: 'TXT',
    name: 'montemader.com',
    content: 'v=spf1 include:_spf.google.com ~all',
    proxyStatus: 'DNS Only',
    ttl: '3600',
  },
] as const

export function GET() {
  return Response.json(
    {
      source: 'user-provided',
      verifiedLive: false,
      records: dnsRecords,
      notes: [
        '192.0.2.14 is a reserved documentation address, not a publicly routable origin IP.',
        'No A or AAAA record for mail.montemader.com was included in the supplied data.',
      ],
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  )
}
