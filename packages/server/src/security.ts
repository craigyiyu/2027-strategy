/**
 * Security primitives:
 * - High-entropy public tokens (≥128-bit requirement; we use 256-bit), only
 *   SHA-256 hashes persisted (SEC-02).
 * - AES-256-GCM answer encryption (SEC-06).
 * - Constant-time comparisons.
 */
import crypto from 'node:crypto';

/** Generate a raw high-entropy token (base64url, 32 random bytes = 256 bits). */
export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function tokenEntropyBits(token: string): number {
  // base64url alphabet: 64 symbols = 6 bits/char
  return token.length * 6;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Derive a 32-byte AES key from ENCRYPTION_KEY (base64) or APP_SECRET. */
function deriveKey(secretB64: string, appSecret: string): Buffer {
  if (secretB64 && secretB64.length >= 16) {
    const b = Buffer.from(secretB64, 'base64');
    if (b.length === 32) return b;
  }
  // fallback deterministic derivation from app secret — never log the key
  return crypto.createHash('sha256').update('2027strategy-enc|' + appSecret).digest();
}

export interface EncryptedPayload {
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
}

export class FieldCipher {
  private key: Buffer;
  constructor(secretB64: string, appSecret: string) {
    this.key = deriveKey(secretB64, appSecret);
  }
  encrypt(plaintext: string): EncryptedPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
  }
  decrypt(p: EncryptedPayload): string {
    const iv = Buffer.from(p.iv, 'base64');
    const tag = Buffer.from(p.tag, 'base64');
    const data = Buffer.from(p.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
