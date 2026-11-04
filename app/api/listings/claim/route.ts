import { NextResponse } from "next/server";
import { recordApprovedOutreachClaim } from "@/server/outreach-attribution";
import { assertListingId, onboardingErrorResponse, requireCurrentOperator } from "@/server/business-onboarding";
import {
  completeEnhancedClaimVerification,
  completeInstantDomainClaim,
  getEnhancedClaimStatus,
  startEnhancedClaimVerification,
  submitManualClaimRequest,
} from "@/server/claim-email-verification";

export async function GET(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const listingId = new URL(request.url).searchParams.get("listingId");
    assertListingId(listingId);
    const status = await getEnhancedClaimStatus(listingId, auth.userId, auth.email);
    await recordApprovedOutreachClaim(request, listingId, auth.userId).catch(() => undefined);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const body = await request.json().catch(() => ({}));
    assertListingId(body.listingId);
    if (body.action === "start") return NextResponse.json(await startEnhancedClaimVerification(body.listingId, auth.userId, auth.email, body.channel || "sms"), { status: 201 });
    if (body.action === "verify" || body.action === "instant_claim") {
      const result = body.action === "verify"
        ? await completeEnhancedClaimVerification(body.listingId, auth.userId, body.code)
        : await completeInstantDomainClaim(body.listingId, auth.userId, auth.email);
      await recordApprovedOutreachClaim(request, body.listingId, auth.userId).catch(() => undefined);
      return NextResponse.json(result);
    }
    if (body.action === "request_review") return NextResponse.json(await submitManualClaimRequest(body.listingId, auth.userId, auth.email, body), { status: 201 });
    return NextResponse.json({ error: "Choose automated verification. Unresolved claims require support review and cannot accept bookings." }, { status: 400 });
  } catch (error) { return onboardingErrorResponse(error); }
}
