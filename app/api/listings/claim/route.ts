import { NextResponse } from "next/server";
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
    return NextResponse.json(await getEnhancedClaimStatus(listingId, auth.userId, auth.email), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const body = await request.json().catch(() => ({}));
    assertListingId(body.listingId);
    if (body.action === "start") return NextResponse.json(await startEnhancedClaimVerification(body.listingId, auth.userId, auth.email, body.channel || "sms"), { status: 201 });
    if (body.action === "verify") return NextResponse.json(await completeEnhancedClaimVerification(body.listingId, auth.userId, body.code));
    if (body.action === "instant_claim") return NextResponse.json(await completeInstantDomainClaim(body.listingId, auth.userId, auth.email));
    if (body.action === "request_review") return NextResponse.json(await submitManualClaimRequest(body.listingId, auth.userId, auth.email, body), { status: 201 });
    return NextResponse.json({ error: "Choose automated verification. Unresolved claims require support review and cannot accept bookings." }, { status: 400 });
  } catch (error) { return onboardingErrorResponse(error); }
}
