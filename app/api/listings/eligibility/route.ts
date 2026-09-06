import { NextResponse } from "next/server";
import { getListingBookingEligibility } from "@/server/business-onboarding";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const listingId = new URL(request.url).searchParams.get("listingId");
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if (!listingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingId)) {
    return NextResponse.json({ eligible: false, reason: "not_found" }, { status: 400, headers });
  }
  try {
    const { eligible, reason } = await getListingBookingEligibility(listingId);
    return NextResponse.json({ eligible: eligible === true, reason }, { headers });
  } catch {
    return NextResponse.json({ eligible: false, reason: "payments_unavailable" }, { status: 503, headers });
  }
}
