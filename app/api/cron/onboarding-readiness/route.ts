import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { refreshStripeAccountReadiness, stripeEnvironment } from "@/server/business-onboarding";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Readiness expires after 15 minutes. Refresh the oldest active accounts first;
// an unavailable provider or missed cron leaves new sales closed on expiry.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const environment = stripeEnvironment();
  const platform = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
  if (!environment || !platform || process.env.BOOKINGS_ENABLED !== "true") {
    return NextResponse.json({ checked: 0, failed: 0, reason: "Bookings remain closed" });
  }
  const q = neon(process.env.DATABASE_URL!);
  const accounts = await q`SELECT stripe_account_id FROM listing_onboarding
    WHERE activated_at IS NOT NULL AND suspended_at IS NULL AND provider_revoked_at IS NULL
      AND provider_environment=${environment} AND platform_account_id=${platform}
      AND stripe_account_id IS NOT NULL
    GROUP BY stripe_account_id ORDER BY min(provider_checked_at) NULLS FIRST LIMIT 50`;
  let checked = 0, failed = 0;
  // Bound concurrency and execution time; remaining accounts stay fail-closed.
  const deadline = Date.now() + 45_000;
  for (let offset = 0; offset < accounts.length && Date.now() < deadline; offset += 5) {
    await Promise.all(accounts.slice(offset, offset + 5).map(async account => {
      try {
        await refreshStripeAccountReadiness(account.stripe_account_id);
        checked++;
      } catch (error) {
        failed++;
        logger.error("Business payment readiness refresh failed", { accountId: account.stripe_account_id, error });
      }
    }));
  }
  return NextResponse.json({ checked, failed });
}
