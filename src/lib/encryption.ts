import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const keyBase64 = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY
  if (!keyBase64) {
    throw new Error('MICROSOFT_TOKEN_ENCRYPTION_KEY environment variable is not set')
  }
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (got ${key.length})`)
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: base64(iv || ciphertext || authTag)
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64')
}

export function decrypt(encrypted: string): string {
  const key = getKey()
  const data = Buffer.from(encrypted, 'base64')
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted data is too short to be valid')
  }
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
