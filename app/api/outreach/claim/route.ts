import { NextResponse } from "next/server";
import { OUTREACH_CONTEXT_COOKIE, decodeOutreachContext, recordClaimInvitationVisit } from "@/server/outreach-attribution";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("context") || "";
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  try {
    const context = decodeOutreachContext(raw, "claim");
    if (!context) return NextResponse.json({ error: "This invitation link is invalid or expired. Find your business at vakaygo.com/for-businesses." }, { status: 400, headers });
    if (!await recordClaimInvitationVisit(context)) return NextResponse.json({ error: "This invitation is unavailable. Find your business at vakaygo.com/for-businesses." }, { status: 404, headers });
    const target = new URL("https://vakaygo.com/auth/signup");
    target.searchParams.set("role", "operator");
    target.searchParams.set("claim", context.listingId!);
    const response = NextResponse.redirect(target, { status: 302, headers });
    // Continuation context contains opaque IDs only. Ownership still follows
    // the ordinary signed-in claim verification, not possession of this link.
    response.cookies.set(OUTREACH_CONTEXT_COOKIE, raw, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "This invitation could not be loaded. Please try again." }, { status: 503, headers }); }
}
