'use client'

import { useState, type FormEvent } from 'react'

type MailLabel = 'reputation' | 'security' | 'account' | 'general' | 'trusted'
type MailItem = { id: string; sender: string; subject: string; body: string; label: MailLabel; receivedAt: string }

const labelNames: Record<MailLabel, string> = {
  reputation: 'Reputation review',
  security: 'Security alert',
  account: 'Account & access',
  general: 'General',
  trusted: 'Trusted sender',
}

function classifyMessage(sender: string, subject: string, body: string, trustedSenders: string[]): MailLabel {
  const normalizedSender = sender.trim().toLowerCase()
  if (trustedSenders.some((entry) => normalizedSender === entry || (entry.startsWith('@') && normalizedSender.endsWith(entry)))) return 'trusted'
  const text = `${subject} ${body}`.toLowerCase()
  if (/spam|phish|malware|abuse|reputation|blacklist|blocklist|suspicious/.test(text)) return 'reputation'
  if (/security|incident|firewall|threat|breach|alert/.test(text)) return 'security'
  if (/password|sign.?in|login|account|verification|verify/.test(text)) return 'account'
  return 'general'
}

function normalizeTrustEntry(value: string) {
  const normalized = value.trim().toLowerCase()
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  const isDomain = /^@?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(normalized)
  if (!isEmail && !isDomain) return null
  return isDomain && !normalized.startsWith('@') ? `@${normalized}` : normalized
}

export function MailSorter() {
  const [inboundAddress, setInboundAddress] = useState('')
  const [sender, setSender] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [trustInput, setTrustInput] = useState('')
  const [trustedSenders, setTrustedSenders] = useState<string[]>([])
  const [messages, setMessages] = useState<MailItem[]>([])
  const [notice, setNotice] = useState('')

  function sortMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sender.trim() || !subject.trim() || !body.trim()) {
      setNotice('Add a sender, subject, and message body to sort a training message.')
      return
    }
    const item: MailItem = {
      id: crypto.randomUUID(),
      sender: sender.trim().slice(0, 254),
      subject: subject.trim().slice(0, 200),
      body: body.trim().slice(0, 4000),
      label: classifyMessage(sender, subject, body, trustedSenders),
      receivedAt: new Date().toISOString(),
    }
    setMessages((current) => [item, ...current].slice(0, 12))
    setSender('')
    setSubject('')
    setBody('')
    setNotice(`Sorted to ${labelNames[item.label]}. This training message is only in this page session.`)
  }

  function addTrustedSender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = normalizeTrustEntry(trustInput)
    if (!normalized) {
      setNotice('Enter a valid email address or domain to trust for this session.')
      return
    }
    setTrustedSenders((current) => current.includes(normalized) ? current : [normalized, ...current].slice(0, 20))
    setTrustInput('')
    setNotice(`${normalized} added to the session-only trusted sender list.`)
  }

  return (
    <div className="mail-sorter-workspace">
      <section className="mail-sorter-card" aria-labelledby="mail-sorter-heading">
        <div className="mail-sorter-heading">
          <div><p className="section-kicker">INBOUND TRAINING · SESSION ONLY</p><h3 id="mail-sorter-heading">Mail sorting activity</h3></div>
          <span className="mail-sorter-state" role="status">Ready for training</span>
        </div>
        <label className="mail-sorter-label" htmlFor="mail-inbound-address">Custom-domain inbound address</label>
        <input id="mail-inbound-address" className="mail-sorter-input" type="email" value={inboundAddress} onChange={(event) => setInboundAddress(event.target.value)} placeholder="inbox@your-domain.com" autoComplete="email" />
        <p className="mail-sorter-note">Resend receiving is not connected yet. Entering an address here does not configure DNS or activate delivery.</p>
        <form className="mail-sorter-form" onSubmit={sortMail}>
          <label className="mail-sorter-label" htmlFor="mail-sender">Train with an inbound message</label>
          <div className="mail-sorter-fields">
            <input id="mail-sender" className="mail-sorter-input" type="email" value={sender} onChange={(event) => setSender(event.target.value)} placeholder="Sender email" autoComplete="off" required />
            <input className="mail-sorter-input" type="text" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" maxLength={200} aria-label="Message subject" required />
          </div>
          <textarea className="mail-sorter-input mail-sorter-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste the message body to classify" maxLength={4000} aria-label="Message body" required />
          <button className="mail-sorter-button" type="submit">Sort training message</button>
        </form>
        <div className="mail-sorter-queue" aria-live="polite">
          {messages.length ? messages.map((message) => (
            <article className="mail-sorter-message" key={message.id}>
              <div><strong>{message.subject}</strong><span>{message.sender}</span></div>
              <span className={`mail-sorter-tag is-${message.label}`}>{labelNames[message.label]}</span>
              <time dateTime={message.receivedAt}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(message.receivedAt))}</time>
            </article>
          )) : <p className="mail-sorter-empty">No inbound messages have been connected or trained in this session.</p>}
        </div>
      </section>

      <section className="mail-sorter-card mail-sorter-rules" aria-labelledby="mail-rules-heading">
        <div className="mail-sorter-heading">
          <div><p className="section-kicker">REPUTATION · WHITELISTING</p><h3 id="mail-rules-heading">Sender trust list</h3></div>
          <span className="mail-sorter-count">{trustedSenders.length} trusted</span>
        </div>
        <p className="mail-sorter-note">Trusted senders are classified as trusted during this browser session only. This does not change Cloudflare or your mail provider.</p>
        <form className="mail-sorter-trust-form" onSubmit={addTrustedSender}>
          <label className="mail-sorter-label" htmlFor="mail-trusted-sender">Add an email address or domain</label>
          <div className="mail-sorter-fields">
            <input id="mail-trusted-sender" className="mail-sorter-input" type="text" value={trustInput} onChange={(event) => setTrustInput(event.target.value)} placeholder="person@example.com or example.com" maxLength={254} autoComplete="off" />
            <button className="mail-sorter-button" type="submit">Trust for session</button>
          </div>
        </form>
        {trustedSenders.length ? (
          <ul className="mail-sorter-trust-list">{trustedSenders.map((entry) => <li key={entry}><span>{entry}</span><button className="mail-sorter-remove" type="button" aria-label={`Remove ${entry} from trusted senders`} onClick={() => setTrustedSenders((current) => current.filter((item) => item !== entry))}>Remove</button></li>)}</ul>
        ) : <p className="mail-sorter-empty">No trusted senders added.</p>}
        <p className="mail-sorter-notice" role="status" aria-live="polite">{notice}</p>
      </section>

      <footer className="mail-sorter-footer"><span>Target: Inbound Mail Reputation &amp; Whitelisting</span><span>Status: Ready for Training</span></footer>
    </div>
  )
}
