import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { isBlockedNetworkHost } from '../../../core/media/media-url';

/**
 * Server-side fetches of learner-supplied URLs must never reach loopback,
 * private networks, link-local metadata services, or DNS aliases that resolve
 * there. Hostname checks alone are not enough, so every hop is also resolved.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Enter a valid http(s) URL.');
  }

  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error('Only http(s) URLs are supported.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedNetworkHost(hostname)) {
    throw new Error('That URL points to a private or local network address.');
  }

  if (!isIP(hostname)) {
    try {
      const addresses = await lookup(hostname, { all: true, verbatim: true });
      if (addresses.length === 0) {
        throw new Error('That hostname could not be resolved.');
      }
      for (const address of addresses) {
        if (isBlockedNetworkHost(address.address)) {
          throw new Error('That hostname resolves to a private or local network address.');
        }
      }
    } catch (error: any) {
      if (error?.code === 'ENOTFOUND') {
        throw new Error('That hostname could not be resolved.');
      }
      throw error;
    }
  }

  return parsed;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Follows a bounded number of redirects, re-validating every destination.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  options: { maxRedirects?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ response: Response; finalUrl: string }> {
  const maxRedirects = Math.max(0, options.maxRedirects ?? 4);
  const timeoutMs = Math.max(2000, options.timeoutMs ?? 15000);
  let current = String(rawUrl || '').trim();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = await assertPublicHttpUrl(current);
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {}),
      },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      response.body?.cancel().catch(() => {});
      if (!location) {
        throw new Error(`The URL returned a ${response.status} redirect without a location.`);
      }
      current = new URL(location, parsed).toString();
      continue;
    }

    return { response, finalUrl: parsed.toString() };
  }

  throw new Error('That URL redirected too many times.');
}
