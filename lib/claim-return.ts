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
