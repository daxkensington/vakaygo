import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { OUTREACH_CAMPAIGN_KEY, OUTREACH_HEALTH_MAX_AGE_MS, checkCampaignSendingWindow } from "@/lib/outreach-campaign-policy";
import { sendBusinessInterestOutreachEmail } from "@/server/outreach-automation";
import { refreshOutreachTelemetry } from "@/server/outreach-campaign-send";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  // Authorization precedes every DB/provider call. URL query parameters
  // cannot change permissions, campaign policy or the one-invocation limit.
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Claim invitation campaign unavailable" }, { status: 503 });
  }
  let attempted = 0;
  try {
    const telemetry = await refreshOutreachTelemetry();
    const db = neon(process.env.DATABASE_URL);
    const [control] = await db.query(
      `SELECT enabled, provider, health_ready, health_checked_at
         FROM outreach_campaign_control WHERE id=true LIMIT 1`
    );
    if (!control) throw new Error("Campaign control is missing");
    const now = new Date();
    const checkedAt = new Date(control.health_checked_at).getTime();
    if (!telemetry.ready || control.health_ready !== true || !Number.isFinite(checkedAt) ||
        checkedAt < now.getTime() - OUTREACH_HEALTH_MAX_AGE_MS || checkedAt > now.getTime() + 60_000 ||
        control.provider !== "resend") {
      return NextResponse.json({ error: "Claim invitation campaign is not ready", attempted: 0 }, { status: 503 });
    }
    if (control.enabled !== true) return NextResponse.json({ ok: true, state: "paused", attempted: 0, sent: 0 });

    // Read existing, consented contact data only. Never scrape, seed listings,
    // create outreach rows, alter claims/onboarding or touch booking controls.
    const candidates = await db.query(
      `SELECT DISTINCT l.id, i.slug AS island_slug
         FROM listings l
         JOIN islands i ON i.id=l.island_id AND i.is_active=true
         JOIN outreach_recipient_consents c ON c.listing_id=l.id
           AND c.recipient_email=lower(btrim(l.type_data->>'email'))
           AND c.provider=$1 AND c.permission_kind='explicit_opt_in'
           AND c.revoked_at IS NULL AND c.granted_at<=now()
        WHERE l.status='active' AND NOT vakaygo_listing_claim_verified(l.id)
          AND coalesce(l.type_data->>'email','')<>''
          AND NOT EXISTS(SELECT 1 FROM business_outreach o WHERE o.listing_id=l.id
            AND (o.status='do_not_contact' OR o.contacted_at IS NOT NULL))
          AND NOT EXISTS(SELECT 1 FROM outreach_email_suppressions s
            WHERE s.recipient=lower(btrim(l.type_data->>'email')))
          AND NOT EXISTS(SELECT 1 FROM outreach_email_attempts a WHERE a.campaign_key=$2
            AND (a.listing_id=l.id OR a.recipient=lower(btrim(l.type_data->>'email'))))
        ORDER BY l.id LIMIT 60`,
      [control.provider, OUTREACH_CAMPAIGN_KEY]
    );
    const candidate = candidates.find(row => checkCampaignSendingWindow(String(row.island_slug || ""), now).allowed);
    if (!candidate) return NextResponse.json({ ok: true, state: "idle", attempted: 0, sent: 0 });

    // Exactly one sender invocation per run. Concurrent invocations, caps,
    // suppression changes and delivery uncertainty remain guarded atomically.
    attempted = 1;
    const result = await sendBusinessInterestOutreachEmail(String(candidate.id), { triggeredBy: "cron" });
    return NextResponse.json({ ok: true, attempted: 1, sent: result.sent ? 1 : 0,
      listingId: candidate.id, reason: result.reason, attemptId: result.attemptId });
  } catch {
    logger.error("Claim invitation cron unavailable", { code: "OUTREACH_CRON_UNAVAILABLE" });
    return NextResponse.json({ error: "Claim invitation campaign unavailable", attempted }, { status: 503 });
  }
}
