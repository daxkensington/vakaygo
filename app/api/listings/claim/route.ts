import { NextResponse } from "next/server";
import { assertListingId, completeClaimVerification, getClaimStatus, onboardingErrorResponse, requireCurrentOperator, startClaimVerification } from "@/server/business-onboarding";

export async function GET(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const listingId = new URL(request.url).searchParams.get("listingId");
    assertListingId(listingId);
    return NextResponse.json(await getClaimStatus(listingId,auth.userId),{ headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const body = await request.json().catch(() => ({}));
    assertListingId(body.listingId);
    if (body.action === "start") return NextResponse.json(await startClaimVerification(body.listingId,auth.userId,body.channel || "sms"),{ status: 201 });
    if (body.action === "verify") return NextResponse.json(await completeClaimVerification(body.listingId,auth.userId,body.code));
    return NextResponse.json({ error: "Choose automated verification. Unresolved claims require support review and cannot accept bookings." },{ status: 400 });
  } catch (error) { return onboardingErrorResponse(error); }
}
