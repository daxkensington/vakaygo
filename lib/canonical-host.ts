/**
 * One public host. `www.vakaygo.com` and `vakaygo.vercel.app` used to serve
 * the whole site with 200, so crawlers had up to three copies of every page
 * and consolidation rested on canonical tags alone.
 *
 * Only these two exact hosts redirect: preview deployments
 * (`vakaygo-<hash>-<team>.vercel.app`) and localhost must keep working.
 *
 * Never redirected:
 * - `/api/*`: Vercel cron invocations do not follow redirects and may arrive
 *   on the `.vercel.app` production host; webhooks and OAuth callbacks post
 *   to fixed URLs.
 * - `/_next/*`, `/_vercel/*`, `/.well-known/*`: assets and platform routes.
 * - anything but GET and HEAD, so a form or server-action POST is not lost.
 */
export const CANONICAL_ORIGIN = "https://vakaygo.com";

const NON_CANONICAL_HOSTS = new Set(["www.vakaygo.com", "vakaygo.vercel.app"]);
const EXEMPT_ROOTS = ["/api", "/_next", "/_vercel", "/.well-known"];

function within(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(root + "/");
}

/**
 * The canonical URL a request should be permanently redirected to, or null
 * when it should be served as is. Path and query string are preserved.
 */
export function canonicalHostRedirect(
  host: string | null | undefined,
  pathname: string,
  search: string,
  method: string,
): string | null {
  if (!host) return null;
  const hostname = host.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
  if (!NON_CANONICAL_HOSTS.has(hostname)) return null;
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return null;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  if (EXEMPT_ROOTS.some((root) => within(pathname, root))) return null;
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${CANONICAL_ORIGIN}${pathname}${query}`;
}
