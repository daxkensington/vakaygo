import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { extendClaimedAvailability } from "@/server/listing-availability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await extendClaimedAvailability();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("Rolling availability extension failed", error);
    return NextResponse.json({ error: "Failed to extend availability" }, { status: 500 });
  }
}
