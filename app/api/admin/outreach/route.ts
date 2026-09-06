import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/server/admin-auth";
import { interestResponse, sameOriginMutation } from "@/server/interest-http";
import { isListingId, isOutreachStatus, outreachDraft } from "@/lib/listing-interest";
import { safeWebUrl } from "@/lib/listing-structured-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  const status = request.nextUrl.searchParams.get("status") || "new";
  const page = Number(request.nextUrl.searchParams.get("page") || 0);
  if ((status !== "all" && !isOutreachStatus(status)) || !Number.isInteger(page) || page < 0 || page > 10000) return interestResponse({ error: "Invalid filter." }, 400);
  try {
    const db = neon(process.env.DATABASE_URL!);
    const rows = await db.query(`SELECT l.id,l.title,l.slug,i.slug "islandSlug",i.name "islandName",l.address,
      l.status "listingStatus",i.is_active "islandActive",l.type_data->>'website' website,tc.phone,
      tc.source "contactSource",tc.source_reference "contactSourceReference",
      o.status,o.notes,o.updated_at::text "updatedAt",o.contacted_at "contactedAt",
      coalesce(d.interested_customers,0)::int "interestedCustomers",d.last_interest "lastInterest",
      vakaygo_listing_claim_verified(l.id) "claimVerified"
      FROM business_outreach o JOIN listings l ON l.id=o.listing_id JOIN islands i ON i.id=l.island_id
      LEFT JOIN listing_trusted_contacts tc ON tc.listing_id=l.id
      LEFT JOIN LATERAL (SELECT count(*)::int interested_customers,max(li.updated_at) last_interest
        FROM listing_interest li JOIN users u ON u.id=li.user_id
        WHERE li.listing_id=l.id AND li.active=true AND u.email_verified=true AND u.role<>'admin' AND u.id<>l.operator_id) d ON true
      WHERE ($1='all' OR o.status=$1)
        AND ($1 NOT IN ('new','reviewing') OR (d.interested_customers>0 AND l.status='active' AND i.is_active=true))
      ORDER BY d.interested_customers DESC NULLS LAST,d.last_interest DESC NULLS LAST,l.id LIMIT 51 OFFSET $2`, [status, page * 50]);
    const items = rows.slice(0, 50).map(row => {
      const item = { ...row, website: safeWebUrl(row.website) || null };
      const draft = row.status !== "do_not_contact" && row.interestedCustomers > 0 && row.listingStatus === "active" && row.islandActive
        ? outreachDraft(row as Parameters<typeof outreachDraft>[0]) : null;
      return { ...item, draft };
    });
    return interestResponse({ items, hasMore: rows.length > 50, page });
  } catch { return interestResponse({ error: "Could not load business outreach." }, 503); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOriginMutation(request)) return interestResponse({ error: "Invalid request origin or content type." }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  let body;
  try { body = await request.json(); } catch { return interestResponse({ error: "Invalid request." }, 400); }
  if (!body || !isListingId(body.listingId) || !isOutreachStatus(body.status) || typeof body.notes !== "string" || body.notes.length > 4000 ||
    typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return interestResponse({ error: "Invalid outreach update." }, 400);
  if ((body.status === "contacted" || body.status === "do_not_contact") && !body.notes.trim()) return interestResponse({ error: "Record the contact channel, outcome, or opt-out reason in the notes." }, 400);
  try {
    const db = neon(process.env.DATABASE_URL!);
    // Compare timestamps prevents one reviewer overwriting another's opt-out.
    // Suppression is terminal in this workflow, including through direct API calls.
    const rows = await db.query(`UPDATE business_outreach SET status=$2,notes=$3,updated_by=$4,updated_at=now(),
      contacted_at=CASE WHEN $2='contacted' AND status<>'contacted' THEN now() ELSE contacted_at END
      WHERE listing_id=$1 AND updated_at=$5::timestamptz AND (status<>'do_not_contact' OR $2='do_not_contact')
      AND EXISTS(SELECT 1 FROM users WHERE id=$4 AND role='admin' AND session_version=$6)
      RETURNING listing_id`, [body.listingId, body.status, body.notes.trim(), auth.userId, body.expectedUpdatedAt, auth.sessionVersion]);
    if (!rows.length) return interestResponse({ error: "This record changed or is suppressed. Refresh before editing. Suppressed businesses cannot be reopened here." }, 409);
    return interestResponse({ saved: true });
  } catch { return interestResponse({ error: "Could not save the outreach update." }, 503); }
}
