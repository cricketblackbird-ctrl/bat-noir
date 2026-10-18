const encoder = new TextEncoder()
const decoder = new TextDecoder()
const keyDerivationIterations = 600_000
const vaultContext = 'Montemader-Key-Chest-v1'

export type VaultCategory = 'key' | 'recovery' | 'site-info'

export type VaultEntry = {
  id: string
  category: VaultCategory
  title: string
  value: string
  createdAt: string
}

export type EncryptedVault = {
  salt: string
  iv: string
  ciphertext: string
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function additionalData(userId: string) {
  return encoder.encode(`${vaultContext}:${userId}`)
}

export function createVaultSalt() {
  return crypto.getRandomValues(new Uint8Array(16))
}

export async function deriveVaultKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: keyDerivationIterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function isVaultEntry(value: unknown): value is VaultEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 100 &&
    (entry.category === 'key' || entry.category === 'recovery' || entry.category === 'site-info') &&
    typeof entry.title === 'string' && entry.title.trim().length > 0 && entry.title.length <= 100 &&
    typeof entry.value === 'string' && entry.value.length > 0 && entry.value.length <= 10_000 &&
    typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt))
}

function parseVaultEntries(value: unknown): VaultEntry[] {
  if (!Array.isArray(value) || value.length > 50 || !value.every(isVaultEntry)) {
    throw new Error('Invalid vault contents')
  }
  return value.map((entry) => ({
    id: entry.id,
    category: entry.category,
    title: entry.title.trim(),
    value: entry.value,
    createdAt: entry.createdAt,
  }))
}

export async function encryptVaultEntries(entries: VaultEntry[], key: CryptoKey, userId: string, salt: string): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(entries))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(userId), tagLength: 128 },
    key,
    plaintext,
  )

  return { salt, iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(new Uint8Array(ciphertext)) }
}

export async function decryptVaultEntries(vault: EncryptedVault, key: CryptoKey, userId: string) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64Url(vault.iv),
      additionalData: additionalData(userId),
      tagLength: 128,
    },
    key,
    decodeBase64Url(vault.ciphertext),
  )
  return parseVaultEntries(JSON.parse(decoder.decode(plaintext)))
}

export function encodeVaultSalt(salt: Uint8Array) {
  return encodeBase64Url(salt)
}

export function decodeVaultSalt(salt: string) {
  return decodeBase64Url(salt)
}
