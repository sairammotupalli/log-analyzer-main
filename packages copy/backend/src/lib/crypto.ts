import crypto from 'crypto';

function getKey(): Buffer {
  // Preferred: explicit 32-byte key (base64 or hex) for encryption-at-rest.
  const raw = process.env.LLM_ENCRYPTION_KEY;
  if (raw) {
    const trimmed = raw.trim();
    // base64 (common)
    try {
      const b = Buffer.from(trimmed, 'base64');
      if (b.length === 32) return b;
    } catch {}
    // hex
    const hexOk = /^[0-9a-fA-F]{64}$/.test(trimmed);
    if (hexOk) return Buffer.from(trimmed, 'hex');
    // fall through -> derive below
  }

  // Fallback: derive from JWT_SECRET (required anyway). Not ideal, but keeps setup simple.
  const secret = process.env.JWT_SECRET || '';
  if (!secret) throw new Error('JWT_SECRET is required to derive encryption key');
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split('.');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid secret encoding');

  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

