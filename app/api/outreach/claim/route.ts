import { NextResponse } from "next/server";
import { OUTREACH_CONTEXT_COOKIE, decodeOutreachContext, recordClaimInvitationVisit } from "@/server/outreach-attribution";

// A business that opens an old or broken invitation lands on the business page,
// where it can still find and claim its listing, instead of a JSON error.
function toBusinessPage(headers: Record<string, string>) {
  return NextResponse.redirect(new URL("https://vakaygo.com/for-businesses"), { status: 302, headers });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("context") || "";
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  try {
    const context = decodeOutreachContext(raw, "claim");
    if (!context) return toBusinessPage(headers);
    if (!await recordClaimInvitationVisit(context)) return toBusinessPage(headers);
    const target = new URL("https://vakaygo.com/auth/signup");
    target.searchParams.set("role", "operator");
    target.searchParams.set("claim", context.listingId!);
    // Campaign tags survive a lost cookie (the verification email often opens in another app).
    target.searchParams.set("utm_source", "outreach");
    target.searchParams.set("utm_medium", "email");
    target.searchParams.set("utm_campaign", "listing-claims-v2");
    const response = NextResponse.redirect(target, { status: 302, headers });
    // Continuation context contains opaque IDs only. Ownership still follows
    // the ordinary signed-in claim verification, not possession of this link.
    response.cookies.set(OUTREACH_CONTEXT_COOKIE, raw, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "This invitation could not be loaded. Please try again." }, { status: 503, headers }); }
}
