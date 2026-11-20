/**
 * Single authoritative registry of clean dedicated frontend HTML routes served by Express/Nest.
 * All workspace features MUST register their dedicated clean path(s) here AND in `frontend/router.js`
 * so deep links and browser hard refreshes (`Cmd+R` / `F5`) preserve exact page state while `/api/*`
 * continues to return structured NestJS JSON responses.
 */

export const STUDIO_PAGE_PATHS = new Set<string>(['/studio', '/studio.html']);

const WORKSPACE_EXACT_PATHS = new Set<string>([
  '/',
  '/index.html',
  '/lessons',
  '/dialogue',
  '/pronunciation',
  '/vocabulary',
  '/history',
  '/lexicon',
  '/tech-lexicon',
  '/tech-linguist',
  '/library',
  '/learning-library',
  '/extractor',
  '/american-extractor',
  '/american-english',
  '/phrases',
]);

const WORKSPACE_SUBROUTE_PREFIXES = [
  '/lexicon/',
  '/tech-lexicon/',
  '/tech-linguist/',
  '/library/',
  '/learning-library/',
  '/extractor/',
  '/american-extractor/',
  '/american-english/',
  '/phrases/',
];

export function normalizePathname(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].trim();
  if (!clean || clean === '/') return '/';
  return clean.replace(/\/+$/, '') || '/';
}

export function isWorkspacePagePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (WORKSPACE_EXACT_PATHS.has(normalized)) return true;
  if (/\.[a-z0-9]{2,6}$/i.test(normalized)) return false;
  return WORKSPACE_SUBROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isRegisteredHtmlRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return STUDIO_PAGE_PATHS.has(normalized) || isWorkspacePagePath(normalized);
}

export function resolveFrontendEntryFile(pathname: string): 'index.html' | 'studio.html' | null {
  const normalized = normalizePathname(pathname);
  if (STUDIO_PAGE_PATHS.has(normalized)) return 'studio.html';
  if (isWorkspacePagePath(normalized)) return 'index.html';
  return null;
}
