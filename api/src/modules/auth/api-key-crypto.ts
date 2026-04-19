import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

type StoredApiKeyEnvelope = {
  v: 1;
  iv: string;
  tag: string;
  value: string;
};

function resolveEncryptionSecret() {
  const secret = process.env.USER_API_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error('USER_API_KEY_ENCRYPTION_SECRET is required');
  }
  return secret;
}

function buildEncryptionKey() {
  return createHash('sha256').update(resolveEncryptionSecret()).digest();
}

function parseEnvelope(value: string): StoredApiKeyEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredApiKeyEnvelope>;
    if (
      parsed?.v === 1 &&
      typeof parsed.iv === 'string' &&
      typeof parsed.tag === 'string' &&
      typeof parsed.value === 'string'
    ) {
      return parsed as StoredApiKeyEnvelope;
    }
  } catch {
    return null;
  }

  return null;
}

export function encryptUserApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', buildEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    value: encrypted.toString('base64'),
  } satisfies StoredApiKeyEnvelope);
}

export function decryptUserApiKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const envelope = parseEnvelope(value);
  if (!envelope) {
    return value;
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    buildEncryptionKey(),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.value, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
