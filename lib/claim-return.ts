const CLAIM_LISTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same-origin path for an in-progress business claim. Rejects anything that is not that path. */
export function claimListingPath(id: string | null | undefined): string | null {
  if (!id || !CLAIM_LISTING_ID.test(id)) return null;
  return `/operator/claim/${id}`;
}

export function claimIdFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = path.match(/^\/operator\/claim\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match ? match[1] : null;
}

/** Signed-in people go straight to verification. New accounts keep the listing id through signup. */
export function claimStartHref(listingId: string, signedIn: boolean): string {
  const path = claimListingPath(listingId);
  if (!path) return "/for-businesses#find-listing";
  return signedIn ? path : `/auth/signup?role=operator&claim=${listingId}`;
}

/** Inbox-proof link. A claim id is carried only as a return path, never as proof of ownership. */
export function verificationUrl(token: string, claimListingId?: string | null): string {
  const url = new URL("https://vakaygo.com/api/auth/verify-email/confirm");
  url.searchParams.set("token", token);
  if (claimListingPath(claimListingId)) url.searchParams.set("claim", claimListingId!);
  return url.toString();
}

/** One-time sign-in link. The claim id is a return path, not proof the inbox owns the business. */
export function magicLinkUrl(token: string, claimListingId?: string | null): string | null {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const url = new URL("https://vakaygo.com/auth/continue");
  url.searchParams.set("token", token);
  if (claimListingPath(claimListingId)) url.searchParams.set("claim", claimListingId!);
  return url.toString();
}

/** Sign-in URL that keeps a valid listing claim in `next`. Other values are omitted. */
export function signInHref(claimListingId?: string | null, options?: { method?: "email"; error?: string }): string {
  const params: string[] = [];
  if (options?.method === "email") params.push("method=email");
  if (options?.error && /^[a-z0-9_]+$/i.test(options.error)) params.push(`error=${options.error}`);
  const path = claimListingPath(claimListingId);
  if (path) params.push(`next=${path}`);
  return params.length ? `/auth/signin?${params.join("&")}` : "/auth/signin";
}
