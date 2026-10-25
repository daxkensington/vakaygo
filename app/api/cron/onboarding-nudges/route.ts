import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { nudgesEnabled, runOnboardingNudges, NUDGE_FEATURE_FLAG } from "@/server/onboarding-nudges";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET — Cron (every 4 h): remind claimed businesses of their next onboarding
 * step and the team of reviews it owes. Policy in lib/onboarding-nudges.ts,
 * delivery in server/onboarding-nudges.ts.
 *
 *   ?dryRun=1  — compute who would be emailed right now; writes and sends nothing.
 *
 * Kill switch: feature flag `operator_onboarding_nudges_enabled` (/admin/feature-flags).
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    if (!await nudgesEnabled()) {
      return NextResponse.json({ ok: true, enabled: false, reason: `${NUDGE_FEATURE_FLAG} is off`, dryRun });
    }
    const result = await runOnboardingNudges({ dryRun });
    return NextResponse.json({ ok: true, enabled: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error("Onboarding nudges cron error", error);
    return NextResponse.json({ error: "Failed to process onboarding nudges" }, { status: 500 });
  }
}
