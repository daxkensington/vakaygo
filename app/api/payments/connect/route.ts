import { NextResponse } from "next/server";
import { assertListingId, connectOnboarding, getOnboardingStatus, onboardingErrorResponse, requireCurrentOperator } from "@/server/business-onboarding";

export async function POST(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const body = await request.json().catch(() => ({}));
    assertListingId(body.listingId);
    return NextResponse.json(await connectOnboarding(body.listingId,auth.userId,auth.email));
  } catch (error) { return onboardingErrorResponse(error); }
}
export async function GET(request: Request) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const listingId = new URL(request.url).searchParams.get("listingId");
    assertListingId(listingId);
    const status = await getOnboardingStatus(listingId,auth.userId,true);
    return NextResponse.json({ ...status.stripe, eligible: status.eligible, reason: status.reason },{ headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}
