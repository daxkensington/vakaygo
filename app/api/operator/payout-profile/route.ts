import { NextResponse } from "next/server";
import { requireCurrentOperator, onboardingErrorResponse } from "@/server/business-onboarding";
import { getOperatorPayoutListings, upsertOperatorPayoutProfile } from "@/server/payout-profiles";

export async function GET() {
  const auth = await requireCurrentOperator();
  if (!auth.ok) return auth.error;
  try {
    const listings = await getOperatorPayoutListings(auth.userId);
    return NextResponse.json({ listings });
  } catch (error) {
    return onboardingErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const auth = await requireCurrentOperator();
  if (!auth.ok) return auth.error;
  try {
    const body = await request.json();
    const updated = await upsertOperatorPayoutProfile(auth.userId, body);
    return NextResponse.json({ listing: updated });
  } catch (error) {
    return onboardingErrorResponse(error);
  }
}
