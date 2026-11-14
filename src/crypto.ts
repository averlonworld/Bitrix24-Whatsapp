import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM for secrets at rest (Bitrix OAuth tokens, WhatsApp login keys).
 * Format: base64(iv[12] || tag[16] || ciphertext).
 */
function keyFrom(b64: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENC_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encrypt(plaintext: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(packed: string, keyB64: string): string {
  const buf = Buffer.from(packed, 'base64');
  if (buf.length < 29) throw new Error('ciphertext too short');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyB64), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

/** Compact signed token: base64url(json).base64url(hmac). Used for UI sessions and media links. */
export function signToken(payload: Record<string, unknown>, secret: string, ttlSec: number): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined | null, secret: string): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
