import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { enrichListingContactEmail, sendBusinessInterestOutreachEmail } from "@/server/outreach-automation";
import { logger } from "@/lib/logger";

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "25");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 60) : 25;

  try {
    const db = neon(process.env.DATABASE_URL!);

    // Prioritize listings that have active traveler interest or historical booking requests first,
    // then high-rated unclaimed listings with websites that haven't been checked yet.
    const candidates = await db.query(
      `SELECT l.id,
              coalesce(d.interested_customers, 0)::int AS interested_customers,
              o.status AS outreach_status,
              o.contacted_at AS contacted_at
       FROM listings l
       JOIN islands i ON i.id = l.island_id AND i.is_active = true
       LEFT JOIN business_outreach o ON o.listing_id = l.id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS interested_customers
         FROM listing_interest li
         JOIN users u ON u.id = li.user_id
         WHERE li.listing_id = l.id
           AND li.active = true
           AND u.email_verified = true
           AND u.role <> 'admin'
           AND u.id <> l.operator_id
       ) d ON true
       WHERE l.status = 'active'
         AND (l.type_data->>'website') IS NOT NULL
         AND (l.type_data->>'email') IS NULL
         AND (l.type_data->>'emailCheckedAt') IS NULL
         AND coalesce(o.status, 'new') <> 'do_not_contact'
       ORDER BY coalesce(d.interested_customers, 0) DESC,
                l.rating_average DESC NULLS LAST,
                l.review_count DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    let enrichedCount = 0;
    let emailedCount = 0;
    const results: Array<{ id: string; email: string | null; emailed: boolean }> = [];

    for (const row of candidates) {
      const res = await enrichListingContactEmail(row.id);
      if (res.email) {
        enrichedCount++;
        let emailed = false;
        if (row.interested_customers > 0 && !row.contacted_at) {
          const mailRes = await sendBusinessInterestOutreachEmail(row.id, { triggeredBy: "cron" }).catch(() => ({ sent: false }));
          emailed = mailRes.sent;
          if (emailed) emailedCount++;
        }
        results.push({ id: row.id, email: res.email, emailed });
      } else {
        // Mark emailCheckedAt so we don't re-crawl websites without emails on every cron run
        await db.query(
          `UPDATE listings
           SET type_data = jsonb_set(coalesce(type_data, '{}'::jsonb), '{emailCheckedAt}', to_jsonb(now()::text), true)
           WHERE id = $1`,
          [row.id]
        );
        results.push({ id: row.id, email: null, emailed: false });
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      enrichedCount,
      emailedCount,
      results,
    });
  } catch (error) {
    logger.error("Enrich listing emails cron failed", error);
    return NextResponse.json({ error: "Failed to enrich listing emails" }, { status: 500 });
  }
}
