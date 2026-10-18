import { LeafPinMark } from '@/components/leaf-pin-mark'

export function MMLiveIndicator() {
  return (
    <section className="mm-live-indicator" aria-label="MM live connection indicator">
      <div className="mm-live-button" role="status">
        <LeafPinMark />
        <span className="mm-live-word">LIVE</span>
      </div>
      <p>If you are connected, I will blink.</p>
    </section>
  )
}
