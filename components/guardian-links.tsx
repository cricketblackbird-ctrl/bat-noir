import Image from 'next/image'
import { Gift, Heart } from 'lucide-react'

const destinations = [
  { id: 'shop', label: 'Free Toys This Way!', href: 'https://shopbboutique.co/vibe/montemader-ytsh', mark: 'gift' },
  { id: 'patreon', label: 'Patreon', href: 'https://patreon.com/montemader', mark: 'patreon' },
  { id: 'substack', label: 'Substack', href: 'https://substack.com/@montemader', mark: 'substack' },
  { id: 'instagram', label: 'Instagram', href: 'https://instagram.com/montemader', mark: 'instagram' },
  { id: 'tiktok', label: 'TikTok', href: 'https://tiktok.com/@montemader', mark: 'tiktok' },
  { id: 'facebook', label: 'Facebook', href: 'https://facebook.com/montemader', mark: 'facebook' },
  { id: 'twloha', label: 'Move For YOU × TWLOHA', href: 'https://give.twloha.com/MonteMader', mark: 'heart' },
  { id: 'linktree', label: 'Linktree', href: 'https://linktr.ee/MonteMader', mark: 'linktree' },
] as const

function DestinationMark({ mark }: { mark: (typeof destinations)[number]['mark'] }) {
  if (mark === 'gift') return <Gift aria-hidden="true" />
  if (mark === 'heart') return <Heart aria-hidden="true" />

  return <Image src={`/brand-icons/${mark}.svg`} alt="" width={30} height={30} />
}

function GuardianRing({ id }: { id: string }) {
  const ringPathId = `guardian-ring-path-${id}`
  const goldGradientId = `guardian-ring-gold-${id}`
  const fillGradientId = `guardian-ring-fill-${id}`

  return (
    <svg className="guardian-link-ring" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={goldGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffdf1" />
          <stop offset="48%" stopColor="#e8ce91" />
          <stop offset="100%" stopColor="#fff8df" />
        </linearGradient>
        <linearGradient id={fillGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67348a" />
          <stop offset="100%" stopColor="#bc4d9a" />
        </linearGradient>
        <path id={ringPathId} d="M 60 60 m -47 0 a 47 47 0 1 1 94 0 a 47 47 0 1 1 -94 0" />
      </defs>
      <circle cx="60" cy="60" r="42" fill={`url(#${fillGradientId})`} />
      <circle cx="60" cy="60" r="46" fill="none" stroke={`url(#${goldGradientId})`} strokeWidth="1.5" />
      <text className="guardian-link-orbit-text">
        <textPath href={`#${ringPathId}`} startOffset="0%" textLength={294} lengthAdjust="spacing">GUARDIAN · GUARDIAN ·</textPath>
      </text>
    </svg>
  )
}

export function GuardianLinks() {
  return (
    <section className="panel guardian-links-panel" aria-labelledby="guardian-links-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">MM · PERSONAL DESTINATIONS</p>
          <h2 id="guardian-links-heading">Your link circles</h2>
        </div>
        <span className="panel-sigil" aria-hidden="true">✦</span>
      </div>
      <p className="guardian-links-intro">Quick links to your other accounts, styled in the MM purple, pink, and gold.</p>
      <ul className="guardian-links-grid" aria-label="External account links">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <a className="guardian-link" href={destination.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${destination.label} in a new tab`}>
              <span className="guardian-link-mark">
                <GuardianRing id={destination.id} />
                <span className="guardian-link-symbol"><DestinationMark mark={destination.mark} /></span>
              </span>
              <span className="guardian-link-name">{destination.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="guardian-links-notice" role="note"><strong>Assignment status:</strong> these are static shortcuts with decorative GUARDIAN rings, not proof of active protection. No Dragon listener or external-site defense is configured for these accounts; this dashboard&apos;s controls apply only to its configured site. SuperBot has no strike permission here. This page does not record clicks on these links or activity on the linked services.</p>
    </section>
  )
}
