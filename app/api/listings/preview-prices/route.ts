import { NextResponse } from "next/server";
import { getListingPreviewPrices } from "@/server/listing-preview-prices";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(",").filter(Boolean))];
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if (ids.length === 0 || ids.length > 12 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return NextResponse.json({ error: "Invalid listing IDs" }, { status: 400, headers });
  }
  try {
    return NextResponse.json({ listings: await getListingPreviewPrices(ids) }, { headers });
  } catch (error) {
    logger.error("Recent listing prices error", error);
    return NextResponse.json({ error: "Prices unavailable" }, { status: 503, headers });
  }
}
