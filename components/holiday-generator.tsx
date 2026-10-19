'use client'

import { Sparkles } from 'lucide-react'
import { FormEvent, useState } from 'react'

type HolidayResponse = { holiday?: string; error?: string }

export function HolidayGenerator() {
  const [holiday, setHoliday] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsGenerating(true)

    try {
      const response = await fetch('/api/holiday', { method: 'POST' })
      const result = (await response.json()) as HolidayResponse
      if (!response.ok || !result.holiday) {
        throw new Error(result.error ?? 'The holiday could not be created. Please try again.')
      }
      setHoliday(result.holiday)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The holiday could not be created. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="holiday-studio" aria-labelledby="holiday-studio-title">
      <div className="holiday-intro">
        <p className="holiday-eyebrow"><Sparkles aria-hidden="true" /> A LITTLE ROOM FOR WONDER</p>
        <h2 id="holiday-studio-title">Invent a reason to gather.</h2>
        <p className="holiday-description">Give the calendar a new tradition: one bright idea, complete with rituals and something good to eat.</p>
        <div className="holiday-ingredients" aria-label="Your holiday will include">
          <span><span>01</span> Traditions</span>
          <span><span>02</span> Rituals</span>
          <span><span>03</span> Festive foods</span>
        </div>
        <form className="holiday-form" onSubmit={handleGenerate}>
          <button className="holiday-generate-button" type="submit" disabled={isGenerating}>
            <Sparkles aria-hidden="true" />
            {isGenerating ? 'Dreaming it up…' : holiday ? 'Imagine another holiday' : 'Invent a holiday'}
          </button>
          <p>Created just for this moment · Powered by Kimi K3</p>
        </form>
      </div>

      <div className="holiday-output" aria-live="polite" aria-busy={isGenerating}>
        {isGenerating ? (
          <div className="holiday-empty-state">
            <span className="holiday-orbit" aria-hidden="true"><Sparkles /></span>
            <p className="holiday-output-label">A new tradition is taking shape</p>
            <p>Gathering a few good ideas…</p>
          </div>
        ) : error ? (
          <div className="holiday-empty-state holiday-error" role="alert">
            <p className="holiday-output-label">A small pause</p>
            <p>{error}</p>
          </div>
        ) : holiday ? (
          <article className="holiday-result-card">
            <div className="holiday-result-topline">
              <span className="holiday-output-label">FRESH FROM THE IMAGINATION</span>
              <span className="holiday-result-mark" aria-hidden="true"><Sparkles /></span>
            </div>
            <p className="holiday-result-text">{holiday}</p>
          </article>
        ) : (
          <div className="holiday-empty-state">
            <span className="holiday-orbit" aria-hidden="true"><Sparkles /></span>
            <p className="holiday-output-label">The next little tradition</p>
            <p>Your new holiday will appear here, with a name, a ritual, and a table worth gathering around.</p>
          </div>
        )}
      </div>
    </section>
  )
}
