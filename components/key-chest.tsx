'use client'

import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import {
  createVaultSalt,
  decodeVaultSalt,
  deriveVaultKey,
  decryptVaultEntries,
  encodeVaultSalt,
  encryptVaultEntries,
  type EncryptedVault,
  type VaultCategory,
  type VaultEntry,
} from '@/lib/vault-crypto'

type VaultResponse = { vault: EncryptedVault | null }

const fetcher = async (url: string): Promise<VaultResponse> => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Vault unavailable')
  return response.json()
}

export function KeyChest({ userId }: { userId: string }) {
  const { data, error: loadError, mutate } = useSWR<VaultResponse>('/api/vault', fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  })
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [activeSalt, setActiveSalt] = useState<string | null>(null)
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [category, setCategory] = useState<VaultCategory>('key')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const savedVault = data?.vault ?? null
  const isUnlocked = vaultKey !== null && activeSalt !== null

  async function saveEntries(nextEntries: VaultEntry[], key = vaultKey, salt = activeSalt) {
    if (!key || !salt) throw new Error('Vault is locked')
    const encrypted = await encryptVaultEntries(nextEntries, key, userId, salt)
    const response = await fetch('/api/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encrypted),
    })
    if (!response.ok) throw new Error('Could not save the encrypted chest')
    await mutate({ vault: encrypted }, false)
    setEntries(nextEntries)
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    setMessage('')
    if (passphrase.length < 16 || passphrase.length > 256) {
      setMessage('Use a chest passphrase between 16 and 256 characters.')
      return
    }
    if (passphrase !== confirmation) {
      setMessage('The passphrases do not match.')
      return
    }

    setBusy(true)
    try {
      const saltBytes = createVaultSalt()
      const salt = encodeVaultSalt(saltBytes)
      const key = await deriveVaultKey(passphrase, saltBytes)
      const encrypted = await encryptVaultEntries([], key, userId, salt)
      const response = await fetch('/api/vault', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      })
      if (!response.ok) throw new Error('Could not initialize the encrypted chest')
      await mutate({ vault: encrypted }, false)
      setVaultKey(key)
      setActiveSalt(salt)
      setEntries([])
      setPassphrase('')
      setConfirmation('')
    } catch {
      setMessage('The chest could not be created. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    setMessage('')
    if (!savedVault) return
    setBusy(true)
    try {
      const key = await deriveVaultKey(passphrase, decodeVaultSalt(savedVault.salt))
      const decryptedEntries = await decryptVaultEntries(savedVault, key, userId)
      setVaultKey(key)
      setActiveSalt(savedVault.salt)
      setEntries(decryptedEntries)
      setPassphrase('')
      setRevealed([])
    } catch {
      setMessage('Could not unlock the chest. Check the passphrase and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onAddEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nativeEvent = event.nativeEvent as SubmitEvent & { isComposing?: boolean; keyCode?: number }
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    setMessage('')
    const cleanTitle = title.trim()
    if (!cleanTitle || !value.trim() || cleanTitle.length > 100 || value.length > 10_000) {
      setMessage('Add a title and a value within the stated limits.')
      return
    }
    if (entries.length >= 50) {
      setMessage('The chest supports up to 50 entries.')
      return
    }

    const nextEntries = [...entries, {
      id: crypto.randomUUID(),
      category,
      title: cleanTitle,
      value,
      createdAt: new Date().toISOString(),
    }]
    setBusy(true)
    try {
      await saveEntries(nextEntries)
      setTitle('')
      setValue('')
      setMessage('Encrypted entry saved.')
    } catch {
      setMessage('The entry was not saved. Your unsaved text remains in the form.')
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveEntry(entry: VaultEntry) {
    if (!window.confirm(`Remove “${entry.title}” from the chest?`)) return
    setMessage('')
    setBusy(true)
    try {
      await saveEntries(entries.filter((item) => item.id !== entry.id))
      setRevealed((current) => current.filter((id) => id !== entry.id))
      setMessage('Entry removed from the encrypted chest.')
    } catch {
      setMessage('The entry could not be removed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function lockChest() {
    setVaultKey(null)
    setActiveSalt(null)
    setEntries([])
    setRevealed([])
    setPassphrase('')
    setConfirmation('')
    setTitle('')
    setValue('')
    setMessage('The chest is locked.')
  }

  return (
    <section className="panel key-chest-panel" aria-labelledby="key-chest-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">PAGE 03 · PRIVATE CREDENTIAL CHEST</p>
          <h2 id="key-chest-heading">Keys &amp; recovery specs</h2>
        </div>
        <span className="key-chest-mark" aria-hidden="true">✦</span>
      </div>
      <p className="key-chest-intro">The chest is encrypted in this browser before anything is saved. Your chest passphrase never leaves this device.</p>

      {loadError ? (
        <div className="key-chest-state" role="status">
          <p>The encrypted chest is unavailable right now.</p>
          <button className="button chest-secondary-button" type="button" onClick={() => void mutate()}>Retry</button>
        </div>
      ) : !data ? (
        <p className="key-chest-state" role="status">Checking the encrypted chest…</p>
      ) : isUnlocked ? (
        <div className="key-chest-open">
          <div className="key-chest-toolbar">
            <p>{entries.length} of 50 encrypted entries</p>
            <button className="button chest-secondary-button" type="button" onClick={lockChest}>Lock chest</button>
          </div>

          <form className="chest-entry-form" onSubmit={onAddEntry}>
            <label className="control-label" htmlFor="chest-category">Entry type</label>
            <select id="chest-category" value={category} onChange={(event) => setCategory(event.target.value as VaultCategory)} disabled={busy}>
              <option value="key">Key or credential</option>
              <option value="recovery">Recovery specification</option>
            </select>
            <label className="control-label" htmlFor="chest-title">Title</label>
            <input id="chest-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} autoComplete="off" disabled={busy} required />
            <label className="control-label" htmlFor="chest-value">Secret or recovery details</label>
            <textarea id="chest-value" value={value} onChange={(event) => setValue(event.target.value)} maxLength={10_000} autoComplete="off" rows={3} disabled={busy} required />
            <button className="button button-primary" type="submit" disabled={busy || entries.length >= 50}>{busy ? 'Saving…' : 'Encrypt & save entry'}</button>
          </form>

          {entries.length > 0 ? (
            <ul className="key-chest-list">
              {entries.map((entry) => {
                const isRevealed = revealed.includes(entry.id)
                return (
                  <li className="key-chest-entry" key={entry.id}>
                    <div className="key-chest-entry-heading">
                      <div>
                        <span className="key-chest-category">{entry.category === 'key' ? 'KEY / CREDENTIAL' : 'RECOVERY SPEC'}</span>
                        <h3>{entry.title}</h3>
                      </div>
                      <div className="key-chest-entry-actions">
                        <button className="chest-text-button" type="button" aria-pressed={isRevealed} onClick={() => setRevealed((current) => isRevealed ? current.filter((id) => id !== entry.id) : [...current, entry.id])}>{isRevealed ? 'Hide' : 'Reveal'}</button>
                        <button className="chest-text-button chest-remove-button" type="button" onClick={() => void onRemoveEntry(entry)} disabled={busy}>Remove</button>
                      </div>
                    </div>
                    <pre className="key-chest-value">{isRevealed ? entry.value : '••••••••••••••••'}</pre>
                  </li>
                )
              })}
            </ul>
          ) : <p className="key-chest-empty">No entries yet. Add a key or recovery specification above.</p>}
        </div>
      ) : savedVault ? (
        <form className="chest-unlock-form" onSubmit={onUnlock}>
          <label className="control-label" htmlFor="chest-passphrase">Chest passphrase</label>
          <input id="chest-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" maxLength={256} required disabled={busy} />
          <button className="button button-primary" type="submit" disabled={busy || passphrase.length === 0}>{busy ? 'Deriving key…' : 'Unlock chest'}</button>
          <p className="key-chest-warning">If this passphrase is lost, the encrypted entries cannot be recovered.</p>
        </form>
      ) : (
        <form className="chest-unlock-form" onSubmit={onCreate}>
          <label className="control-label" htmlFor="chest-new-passphrase">Create chest passphrase</label>
          <input id="chest-new-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" minLength={16} maxLength={256} required disabled={busy} />
          <label className="control-label" htmlFor="chest-confirm-passphrase">Confirm passphrase</label>
          <input id="chest-confirm-passphrase" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={16} maxLength={256} required disabled={busy} />
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Creating encrypted chest…' : 'Create encrypted chest'}</button>
          <p className="key-chest-warning">Use at least 16 characters. Keep a separate recovery copy; this app cannot reset your chest passphrase.</p>
        </form>
      )}

      {message && <p className="key-chest-message" role="status">{message}</p>}
    </section>
  )
}
