/**
 * Signs/verifies the /admin session cookie using the Web Crypto API
 * (`crypto.subtle`), not Node's `crypto.createHmac` — this is the one API
 * available as a global in both the Node route-handler runtime and the
 * Edge runtime that middleware.ts runs in by default, so the same code
 * verifies the cookie in both places without a runtime split.
 *
 * Token shape: "<expiresAtMs>.<base64url HMAC-SHA256 signature>". The
 * signing key (ADMIN_SESSION_SECRET) is kept separate from ADMIN_PASSWORD
 * so rotating the login password doesn't invalidate the signing scheme.
 */

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not configured.');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signSessionToken(): Promise<string> {
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAtMs);
  const key = await getKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expiresAtMs = Number(payload);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;

  try {
    const key = await getKey();
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return toBase64Url(expected) === signature;
  } catch {
    return false;
  }
}
