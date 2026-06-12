/**
 * Pass-through route helper. Exists as a single seam so we can later
 * inject a base path or rewrite paths without touching call sites.
 */
export function appRoute(path: string): string {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}