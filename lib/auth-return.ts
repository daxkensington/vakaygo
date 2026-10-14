/** A navigation destination only; never proof of identity, role or listing ownership. */
export function safeAuthNext(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  // Auth continuations use plain local paths. Encoded path separators, dot
  // segments and backslashes can be interpreted differently by URL consumers.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!/^\/(?!\/)[A-Za-z0-9_./-]*$/.test(pathname)) return null;
  if (pathname.includes("//") || pathname.split("/").some(part => part === "." || part === "..")) return null;
  // A return should reach a page, not restart authentication or invoke an API.
  if (/^\/(?:api|auth)(?:\/|$)/i.test(pathname)) return null;
  try {
    const decoded = decodeURIComponent(value); // Query text may contain spaces and escaped punctuation.
    if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
    const url = new URL(value, "https://vakaygo.com");
    return url.origin === "https://vakaygo.com" && url.pathname === pathname
      ? `${url.pathname}${url.search}${url.hash}`
      : null;
  } catch { return null; }
}
