import { safeAuthNext } from "@/lib/auth-return";

export const OPERATOR_SESSION_EXPIRED = "vakaygo:operator-session-expired";
let requestEpoch = 0;

/** Retire requests from a previous dashboard mount or account. Client lifecycle only. */
export function invalidateOperatorRequests(): void {
  requestEpoch += 1;
}

/** A local navigation continuation; it never grants business access. */
export function operatorSignInHref(fallback = "/operator"): string {
  const location = typeof window === "undefined" ? null : window.location;
  const current = location && /^\/operator(?:\/|$)/.test(location.pathname)
    ? `${location.pathname}${location.search}${location.hash}`
    : fallback;
  return `/auth/signin?next=${encodeURIComponent(safeAuthNext(current) || "/operator")}`;
}

/** Notify the mounted operator shell on expiry without retrying any request. */
export async function operatorFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const epoch = requestEpoch;
  const response = await globalThis.fetch(input, init);
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  let expired = response.status === 401;
  if (input === "/api/auth/session" && response.ok) {
    const session = await response.clone().json().catch(() => null);
    expired = session?.user === null;
  }
  if (expired && epoch === requestEpoch && !signal?.aborted && typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPERATOR_SESSION_EXPIRED));
  }
  return response;
}
