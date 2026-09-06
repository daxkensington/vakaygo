export const INTEREST_NOTICE_VERSION = "2026-09-06";
export const OUTREACH_STATUSES = ["new", "reviewing", "contacted", "do_not_contact"] as const;
export type OutreachStatus = typeof OUTREACH_STATUSES[number];
export function isOutreachStatus(value: unknown): value is OutreachStatus {
  return OUTREACH_STATUSES.includes(value as OutreachStatus);
}
export function isListingId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function outreachDraft(item: { title: string; islandName: string; islandSlug: string; slug: string; id: string; interestedCustomers: number; claimVerified: boolean }): string {
  const listingUrl = "https://vakaygo.com/" + item.islandSlug + "/" + item.slug;
  const actionUrl = item.claimVerified ? "https://vakaygo.com/operator" : "https://vakaygo.com/auth/signup?role=operator&claim=" + item.id;
  return [
    "Subject: Traveler interest in " + item.title + " on VakayGo",
    "", "Hello " + item.title + " team,", "",
    "I’m reaching out from VakayGo about your business listing in " + item.islandName + ".",
    item.interestedCustomers + " " + (item.interestedCustomers === 1 ? "verified email account has" : "verified email accounts have") + " recorded interest in this listing on VakayGo. These are interest signals, not reservations or booking requests.",
    "", "Your listing: " + listingUrl,
    item.claimVerified ? "You can review and update your listing in your business dashboard: " + actionUrl : "If you are the owner or an authorized representative, you can start a free ownership claim here: " + actionUrl,
    "", "VakayGo is currently operating as a directory. Claiming a listing does not enable bookings or payments.",
    "", "Thank you,", "[Your name] · VakayGo",
    "[Add VakayGo’s legal business name and mailing address]",
    "https://vakaygo.com · hello@vakaygo.com",
    "If you do not want further business outreach from VakayGo, reply ‘unsubscribe’ and we will record your preference.",
  ].join("\n");
}
