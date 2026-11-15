import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALGO = 'aes-256-gcm';

export function maskApiKey(rawKey: string): string {
  const s = String(rawKey || '').trim();
  if (!s) return 'local';
  if (s.length <= 10) return `${s.slice(0, 2)}••••${s.slice(-2)}`;
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

export function fingerprintApiKey(rawKey: string, providerId: string, baseUrl: string): string {
  return crypto
    .createHash('sha256')
    .update(`${providerId}::${baseUrl.replace(/\/+$/, '')}::${rawKey.trim()}`)
    .digest('hex')
    .slice(0, 20);
}

/**
 * Validates provider base URL to block SSRF tricks (metadata IPs, non-HTTP schemes).
 */
export function sanitizeAndValidateBaseUrl(
  rawUrl: string,
  opts?: { allowLocalhost?: boolean },
): string {
  const clean = String(rawUrl || '').trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error('Invalid provider Base URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Provider Base URL must use http:// or https://.');
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isPrivateIp =
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:');

  if ((isLoopback || isPrivateIp) && !opts?.allowLocalhost) {
    throw new Error('Private or localhost base URLs are only allowed for custom local endpoints.');
  }

  if (
    host === '169.254.169.254' ||
    host.startsWith('169.254.') ||
    host === 'metadata.google.internal' ||
    host === '0.0.0.0'
  ) {
    throw new Error('Disallowed network host in Base URL.');
  }

  if (parsed.protocol === 'http:' && !isLoopback) {
    throw new Error('Remote provider endpoints must use HTTPS.');
  }

  return parsed.toString().replace(/\/+$/, '');
}

let cachedVaultSecret: Buffer | null = null;

function resolveVaultKey(dbPath?: string): Buffer {
  if (cachedVaultSecret) return cachedVaultSecret;

  const envSecret =
    process.env.AI_KEY_VAULT_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.FLAPTAP_VAULT_SECRET ||
    '';

  if (envSecret.trim()) {
    cachedVaultSecret = crypto.createHash('sha256').update(envSecret.trim()).digest();
    return cachedVaultSecret;
  }

  const baseDir = dbPath
    ? path.dirname(dbPath)
    : path.resolve(__dirname, '../../../../../data');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const secretFile = path.join(baseDir, '.vault.key');
  if (fs.existsSync(secretFile)) {
    const hex = fs.readFileSync(secretFile, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(hex)) {
      cachedVaultSecret = Buffer.from(hex, 'hex');
      return cachedVaultSecret;
    }
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(secretFile, generated.toString('hex'), { mode: 0o600 });
  cachedVaultSecret = generated;
  return cachedVaultSecret;
}

export function encryptApiKey(plaintext: string, dbPath?: string): string {
  const key = resolveVaultKey(dbPath);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decryptApiKey(payload: string, dbPath?: string): string {
  const parts = String(payload || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Corrupted encrypted API key payload.');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = resolveVaultKey(dbPath);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
