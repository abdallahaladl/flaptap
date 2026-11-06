import { createHash } from 'crypto';
import { isIP } from 'net';

/**
 * Universal media URL classification shared by every backend layer.
 *
 * - YouTube URLs / raw 11-char IDs keep their native video ID and use the
 *   fast JSON3 caption pipeline + YouTube IFrame player.
 * - Any other public http(s) social/video URL (TikTok, Instagram, X, Vimeo,
 *   Facebook, Reddit, TED, Loom, Twitch, Dailymotion, direct media files)
 *   gets a deterministic `ext_<sha1-12>` media ID. The Python helper caches
 *   the downloaded media under `data/media/<id>.mp4` and the studio streams
 *   it from our own origin with HTTP Range support.
 *
 * Mirrors `classify_media_url` in `extract_transcript.py` byte-for-byte so
 * Node and Python always agree on the media ID.
 */

export type MediaSource = 'youtube' | 'external';

export interface MediaUrlInfo {
  source: MediaSource;
  mediaId: string;
  platform: string;
  canonicalUrl: string;
}

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

const STRIP_TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'igsh', 'igshid', 'si', 'fbclid', 'gclid', 'feature', 'ref', 'ref_src',
]);

export const EXTERNAL_MEDIA_ID_PATTERN = /^ext_[a-f0-9]{12}$/;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function extractYoutubeId(raw: string): string {
  if (!raw) return '';
  const clean = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  let host = '';
  try {
    host = new URL(clean).hostname.toLowerCase();
  } catch {
    host = '';
  }
  if (host && !YOUTUBE_DOMAINS.some((d) => hostMatches(host, d))) return '';
  const match =
    clean.match(/(?:v=|\/shorts\/|\/embed\/|\/live\/|\/v\/|youtu\.be\/|\/e\/)([\w-]{11})/) ||
    clean.match(/[?&]v=([\w-]{11})/);
  return match ? match[1] : '';
}

function isBlockedHost(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host === '0.0.0.0' || host === 'broadcasthost') return true;
  if (/\.(local|internal|localhost|lan)$/.test(host)) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (ipVersion === 6) {
    return host === '::1' || host === '::' || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(host);
  }
  return !host.includes('.');
}

export function detectPlatformLabel(hostname: string, pathLower = ''): string {
  const host = (hostname || '').toLowerCase();
  if (YOUTUBE_DOMAINS.some((d) => host.includes(d))) return 'YouTube';
  if (host.includes('tiktok.com')) return 'TikTok';
  if (host.includes('instagram.com')) return 'Instagram';
  if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 't.co'].includes(host)) return 'X';
  if (host.includes('vimeo.com')) return 'Vimeo';
  if (host.includes('facebook.com') || host.includes('fb.watch') || host === 'fb.com') return 'Facebook';
  if (host.includes('reddit.com') || host.includes('redd.it')) return 'Reddit';
  if (host.includes('ted.com')) return 'TED';
  if (host.includes('twitch.tv')) return 'Twitch';
  if (host.includes('loom.com')) return 'Loom';
  if (host.includes('dailymotion.com') || host.includes('dai.ly')) return 'Dailymotion';
  if (host.includes('linkedin.com')) return 'LinkedIn';
  if (host.includes('threads.net')) return 'Threads';
  if (host.includes('bsky.app')) return 'Bluesky';
  if (/\.(mp4|webm|m4a|mp3|mov|wav)$/.test(pathLower)) return 'Direct Media';
  return 'Web Video';
}

/** Python `urllib.parse.urlencode` compatible encoding (spaces -> '+'). */
function pyQuotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*~]/g, (c) => (c === '~' ? '~' : `%${c.charCodeAt(0).toString(16).toUpperCase()}`));
}

export function classifyMediaUrl(raw: string): MediaUrlInfo | null {
  if (!raw) return null;
  const clean = raw.trim();
  const ytId = extractYoutubeId(clean);
  if (ytId) {
    return {
      source: 'youtube',
      mediaId: ytId,
      platform: 'YouTube',
      canonicalUrl: /^https?:\/\//i.test(clean) ? clean : `https://www.youtube.com/watch?v=${ytId}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  if ((scheme !== 'http' && scheme !== 'https') || isBlockedHost(hostname)) return null;
  if (YOUTUBE_DOMAINS.some((d) => hostMatches(hostname, d))) return null;

  const kept: string[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (!value) return;
    if (STRIP_TRACKING_PARAMS.has(key.toLowerCase())) return;
    kept.push(`${pyQuotePlus(key)}=${pyQuotePlus(value)}`);
  });
  const netloc = (parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@` : '') + parsed.host;
  const normalized = `${scheme}://${netloc.toLowerCase()}${parsed.pathname || '/'}${kept.length ? `?${kept.join('&')}` : ''}`;
  const digest = createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12);

  return {
    source: 'external',
    mediaId: `ext_${digest}`,
    platform: detectPlatformLabel(hostname, parsed.pathname.toLowerCase()),
    canonicalUrl: clean,
  };
}
