import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { isListingId } from "@/lib/listing-interest";
import { verifyOutreachUnsubscribeToken } from "@/server/outreach-automation";
import { decodeOutreachContext, unsubscribeInvitation } from "@/server/outreach-attribution";

// Opening the link (GET) only shows a confirmation page. Mail security scanners
// open every link in a message; if GET recorded the opt-out they would unsubscribe
// businesses that never asked. The opt-out is recorded on POST: the button on the
// confirmation page, or the mail client's one-click request (RFC 8058,
// List-Unsubscribe-Post), which is always a POST.

function page(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} | VakayGo</title></head>
<body style="margin:0;padding:48px 20px;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1C2333;text-align:center">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #EDE5D5;border-radius:20px;padding:36px 28px;box-shadow:0 2px 12px rgba(28,35,51,0.06)">
    <div style="font-size:24px;font-weight:bold;margin-bottom:16px">Vakay<span style="color:#C8912E">Go</span></div>
    <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
    ${body}
  </div>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function renderHtmlPage(title: string, message: string, status = 200) {
  return page(title, `<p style="font-size:15px;line-height:1.6;color:#4A4F73;margin:0 0 24px">${message}</p>
    <a href="https://vakaygo.com" style="display:inline-block;background:#1C2333;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600">Return to VakayGo</a>`, status);
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The form posts back to this same signed link; nothing is recorded until it is submitted. */
function renderConfirmPage(search: string) {
  return page("Stop VakayGo listing invitations?", `<p style="font-size:15px;line-height:1.6;color:#4A4F73;margin:0 0 24px">Confirm below and this email address will not receive further VakayGo listing invitations.</p>
    <form method="post" action="/api/outreach/unsubscribe?${escapeAttribute(search)}" style="margin:0">
      <button type="submit" style="display:inline-block;background:#1C2333;color:#FFFFFF;border:0;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">Unsubscribe</button>
    </form>
    <p style="font-size:13px;line-height:1.6;color:#4A4F73;margin:20px 0 0">Nothing changes unless you press the button. You can also email support@vakaygo.com.</p>`);
}

type Target = { kind: "context"; context: NonNullable<ReturnType<typeof decodeOutreachContext>> } | { kind: "legacy"; listingId: string };

/** Signature checks only: no database work, for GET and POST alike. */
function resolveTarget(request: NextRequest): Target | NextResponse {
  const contextToken = request.nextUrl.searchParams.get("context");
  if (contextToken) {
    let context: ReturnType<typeof decodeOutreachContext>;
    try { context = decodeOutreachContext(contextToken, "unsubscribe"); }
    catch { return renderHtmlPage("Temporary Error", "We could not read this link. Please retry or contact support@vakaygo.com.", 503); }
    if (!context) return renderHtmlPage("Invalid Unsubscribe Link", "This link is invalid. Contact support@vakaygo.com to opt out.", 400);
    return { kind: "context", context };
  }
  const listingId = request.nextUrl.searchParams.get("listingId") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!isListingId(listingId) || !verifyOutreachUnsubscribeToken(listingId, token)) {
    return renderHtmlPage(
      "Invalid Unsubscribe Link",
      "This opt-out link is invalid or expired. Please reply 'unsubscribe' to any VakayGo outreach email or contact support@vakaygo.com.",
      400
    );
  }
  return { kind: "legacy", listingId };
}

export async function GET(request: NextRequest) {
  const target = resolveTarget(request);
  if (target instanceof NextResponse) return target;
  // Re-emit only the parameters that were verified, never the raw query string.
  const search = new URLSearchParams();
  if (target.kind === "context") search.set("context", request.nextUrl.searchParams.get("context") || "");
  else { search.set("listingId", target.listingId); search.set("token", request.nextUrl.searchParams.get("token") || ""); }
  return renderConfirmPage(search.toString());
}

export async function POST(request: NextRequest) {
  const target = resolveTarget(request);
  if (target instanceof NextResponse) return target;
  if (target.kind === "context") {
    try {
      if (!await unsubscribeInvitation(target.context)) return renderHtmlPage("Unsubscribe Link Unavailable", "Contact support@vakaygo.com to opt out.", 404);
      return renderHtmlPage("You Have Been Unsubscribed", "We have recorded your preference. This email address will not receive further VakayGo campaign invitations.");
    } catch { return renderHtmlPage("Temporary Error", "We could not record your preference. Please retry or contact support@vakaygo.com.", 503); }
  }

  const listingId = target.listingId;
  try {
    const db = neon(process.env.DATABASE_URL!);
    const note = `[${new Date().toISOString().slice(0, 10)}] Business opted out via the unsubscribe link.`;
    await db.transaction(tx => [
      tx.query("SELECT pg_advisory_xact_lock(hashtextextended('vakaygo-outreach-campaign',0))"),
      tx.query(
      `INSERT INTO business_outreach (listing_id, status, notes, updated_at)
       VALUES ($1, 'do_not_contact', $2, now())
       ON CONFLICT (listing_id) DO UPDATE
       SET status = 'do_not_contact',
           updated_at = now(),
           notes = left(
             CASE
               WHEN business_outreach.notes = '' THEN $2
               ELSE business_outreach.notes || E'\\n' || $2
             END,
             4000
           )`,
      [listingId, note]
      ),

    // Older invitation links were listing-scoped. Preserve their opt-out for
    // every known recipient on that listing, including the original send note,
    // so a changed address or provider cannot reopen the same contact.
      tx.query(`WITH sources AS (
       SELECT lower(btrim(type_data->>'email')) AS recipient FROM listings WHERE id=$1::uuid
       UNION SELECT recipient FROM outreach_email_attempts WHERE listing_id=$1::uuid
       UNION SELECT lower((regexp_matches(notes,'Claim invitation emailed to ([^[:space:]]+)','g'))[1])
         FROM business_outreach WHERE listing_id=$1::uuid),
      targets AS (SELECT DISTINCT recipient FROM sources WHERE recipient ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,24}$'),
      blocked AS (INSERT INTO outreach_email_suppressions(recipient,reason) SELECT recipient,'unsubscribe' FROM targets
       ON CONFLICT(recipient) DO NOTHING RETURNING recipient)
      UPDATE outreach_recipient_consents SET revoked_at=now(),revocation_reason='legacy_recipient_unsubscribe'
      WHERE recipient_email IN (SELECT recipient FROM targets) AND revoked_at IS NULL`, [listingId]),
    ], { isolationLevel: "ReadCommitted" });

    return renderHtmlPage(
      "You Have Been Unsubscribed",
      "We have recorded your preference. Your business listing will not receive further automated interest outreach emails from VakayGo."
    );
  } catch {
    return renderHtmlPage(
      "Temporary Error",
      "We could not record your preference right now. Please try again or email support@vakaygo.com.",
      503
    );
  }
}
