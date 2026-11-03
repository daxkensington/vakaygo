import { NextResponse } from "next/server";
import { getMapListingPage } from "@/server/map-listings";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const island = params.get("island");
  const cursor = params.get("cursor");
  const version = params.get("v");
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if ((version !== null && version !== "1" && version !== "2") || params.getAll("v").length > 1
    || (island !== null && !/^[a-z0-9-]{1,64}$/.test(island))
    || (cursor !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor))) {
    return NextResponse.json({ error: "Invalid map filters" }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await getMapListingPage(island, cursor, version === "2"), { headers });
  } catch (error) {
    logger.error("Map listings error", error);
    return NextResponse.json({ error: "Map listings could not be loaded" }, { status: 503, headers });
  }
}
