import { NextResponse } from "next/server";
import { getListingDetail } from "@/server/listing-detail";

import { logger } from "@/lib/logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const result = await getListingDetail(slug);

    if (!result) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Listing detail error", error);
    return NextResponse.json({ error: "Failed to fetch listing" }, { status: 500 });
  }
}
