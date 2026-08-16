/**
 * NSE India proxy using native fetch (replaces curl.exe-based server.js).
 *
 * Strategy: Per-request session init.
 *   1. Hit nseindia.com homepage to get session cookies.
 *   2. Use those cookies for the real API call.
 *   Both happen within one serverless function invocation — no persistent state needed.
 *
 * In-memory warm cache: if a warm Lambda instance is reused within 60s we skip
 * the init step to stay well within Vercel's function timeout limit.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const NSE_HOME = 'https://www.nseindia.com';

interface NseResult {
  status: number;
  body: string;
}

// In-memory cookie cache (per warm Lambda instance).
let cachedCookies: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Extract cookies from a Response's Set-Cookie headers and
 * merge them with any existing cookies string.
 */
function mergeCookies(existing: string | null, response: Response): string {
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  if (!setCookies || setCookies.length === 0) return existing ?? '';

  const newCookies = setCookies
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean);

  if (!existing) return newCookies.join('; ');

  const map = new Map<string, string>();
  for (const pair of existing.split('; ')) {
    const [k] = pair.split('=');
    if (k) map.set(k.trim(), pair);
  }
  for (const pair of newCookies) {
    const [k] = pair.split('=');
    if (k) map.set(k.trim(), pair);
  }
  return [...map.values()].join('; ');
}

/**
 * Initialise an NSE session by fetching the homepage.
 * Returns a cookie string ready to pass as Cookie header.
 */
async function initNseSession(): Promise<string> {
  const now = Date.now();
  if (cachedCookies && now < cacheExpiry) {
    return cachedCookies;
  }

  const res = await fetch(NSE_HOME, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const cookies = mergeCookies(null, res);
  cachedCookies = cookies;
  cacheExpiry = now + CACHE_TTL_MS;
  return cookies;
}

/**
 * Fetch a URL from NSE, initialising a session first.
 * Handles a single 403 retry with a fresh session.
 */
export async function fetchFromNse(url: string, symbol: string): Promise<NseResult> {
  let cookies = await initNseSession();

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
    Cookie: cookies,
  };

  let res = await fetch(url, { headers });

  if (res.status === 403) {
    cachedCookies = null;
    cookies = await initNseSession();
    res = await fetch(url, { headers: { ...headers, Cookie: cookies } });
  }

  const body = await res.text();
  return { status: res.status, body };
}

/**
 * Fetch NSE autocomplete search results.
 */
export async function searchNse(query: string): Promise<NseResult> {
  const url = `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(query.trim())}`;

  let cookies = await initNseSession();

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.nseindia.com/',
    Cookie: cookies,
  };

  let res = await fetch(url, { headers });

  if (res.status === 403) {
    cachedCookies = null;
    cookies = await initNseSession();
    res = await fetch(url, { headers: { ...headers, Cookie: cookies } });
  }

  const body = await res.text();
  return { status: res.status, body };
}
