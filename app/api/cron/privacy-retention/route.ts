import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runPrivacyRetention } from "@/server/privacy-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — Cron (daily): shorten visitor addresses on listing views older than
 * 30 days to their network, and delete usage-budget counters older than 35
 * days. Rules and reasons in server/privacy-retention.ts.
 *
 *   ?dryRun=1  — count what is due; changes nothing.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    const result = await runPrivacyRetention({ dryRun });
    if (!dryRun && (result.viewAddresses.coarsened || result.usageCounters.deleted)) {
      logger.info("Privacy retention", { coarsened: result.viewAddresses.coarsened, deleted: result.usageCounters.deleted });
    }
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error("Privacy retention cron error", error);
    return NextResponse.json({ error: "Failed to apply retention" }, { status: 500 });
  }
}
