import { sendEmail } from "@/server/mail-client";
import { TEAM_INBOX } from "@/lib/booking-request";

/**
 * Emails for booking REQUESTS and listing CLAIMS.
 *
 * Booking requests replace "Booking Confirmed" for the ~7,100 listings whose
 * business cannot see bookings yet (see lib/booking-request.ts). Claims are
 * the path by which one of those businesses takes its listing over.
 *
 * Every traveler/operator-facing mail sets reply-to to the team inbox: the
 * `hello@` sender has no mailbox, so replies to it were bouncing.
 */


const FROM = "VakayGo <hello@vakaygo.com>";

function shell(inner: string, header: { eyebrow: string; title: string; tone?: "teal" | "gold" }) {
  const bg = header.tone === "gold" ? "#C8912E" : "#1A6B6A";
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FEFCF7;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">
  <div style="text-align:center;margin-bottom:24px">
    <span style="font-size:24px;font-weight:bold;color:#1C2333">Vakay<span style="color:#C8912E">Go</span></span>
  </div>
  <div style="background:${bg};border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
    <p style="color:white;font-size:14px;margin:0 0 8px">${esc(header.eyebrow)}</p>
    <h1 style="color:white;font-size:22px;margin:0">${esc(header.title)}</h1>
  </div>
  <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(28,35,51,0.08)">
    ${inner}
  </div>
  <p style="text-align:center;color:#9A9DB0;font-size:11px;margin-top:24px">VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E">vakaygo.com</a></p>
</div>
</body></html>`.trim();
}

/** Listing titles, notes and names are user/operator supplied — escape them. */
export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, valueHtml: string) {
  return `<tr><td style="padding:4px 0;font-weight:600;color:#1C2333;vertical-align:top">${label}</td><td style="text-align:right;color:#4A4F73">${valueHtml}</td></tr>`;
}

function link(href: string, text: string) {
  return `<a href="${esc(href)}" style="color:#C8912E">${esc(text)}</a>`;
}

// ─── Booking requests ─────────────────────────────────────────────

/** Traveler: request received, nothing charged, nothing confirmed yet. */
export async function sendBookingRequestReceived(params: {
  to: string;
  travelerName: string;
  bookingNumber: string;
  listingTitle: string;
  whenText: string; // pre-formatted wall-clock text
  guestCount: number;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: p.to,
    replyTo: TEAM_INBOX,
    subject: `Request received — ${p.listingTitle}`,
    html: shell(
      `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.travelerName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">We have received your request for <strong>${esc(p.listingTitle)}</strong>. <strong>Nothing has been charged and nothing is confirmed yet.</strong> Our team will contact the business directly to confirm your date and get back to you by email, usually within 24 hours.</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Request #", esc(p.bookingNumber))}
        ${row("When", esc(p.whenText))}
        ${row("Guests", String(p.guestCount))}
      </table>
    </div>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Need to change something? Reply to this email. You can also see the status at ${link("https://vakaygo.com/bookings", "vakaygo.com/bookings")}.</p>`,
      { eyebrow: "Request received", title: p.listingTitle, tone: "gold" }
    ),
  });
}

/** Team inbox: everything needed to phone the business and confirm. */
export async function sendBookingRequestToTeam(params: {
  bookingNumber: string;
  listingTitle: string;
  listingUrl: string;
  islandName: string;
  businessPhone: string | null;
  businessWebsite: string | null;
  whenText: string;
  guestCount: number;
  guestNotes: string | null;
  travelerName: string;
  travelerEmail: string;
  travelerPhone: string | null;
  unclaimed: boolean;
}) {
  const p = params;
  const why = p.unclaimed
    ? "an <strong>unclaimed</strong> listing. The business has NOT been notified. Call them, confirm, then tell the traveler."
    : "a listing with no price. Confirm details and pricing with the business, then tell the traveler.";
  await sendEmail({
    from: FROM,
    to: TEAM_INBOX,
    replyTo: p.travelerEmail,
    subject: `ACTION: booking request ${p.bookingNumber} — ${p.listingTitle} (${p.islandName})`,
    html: shell(
      `
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">A traveler requested a booking on ${why}</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Business", link(p.listingUrl, p.listingTitle))}
        ${row("Island", esc(p.islandName))}
        ${row("Business phone", p.businessPhone ? esc(p.businessPhone) : "<em>none on file</em>")}
        ${row("Website", p.businessWebsite ? link(p.businessWebsite, p.businessWebsite) : "—")}
        ${row("When", esc(p.whenText))}
        ${row("Guests", String(p.guestCount))}
        ${row("Notes", p.guestNotes ? esc(p.guestNotes) : "—")}
      </table>
    </div>
    <div style="background:#EAF4F4;border-radius:12px;padding:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Traveler", esc(p.travelerName))}
        ${row("Email", link(`mailto:${p.travelerEmail}`, p.travelerEmail))}
        ${row("Phone", p.travelerPhone ? esc(p.travelerPhone) : "—")}
        ${row("Request #", esc(p.bookingNumber))}
      </table>
    </div>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Reply-to is the traveler. Manage in ${link("https://vakaygo.com/admin/bookings", "admin → bookings")}.</p>`,
      { eyebrow: "Booking request", title: p.listingTitle, tone: "gold" }
    ),
  });
}

// ─── Listing claims ───────────────────────────────────────────────

export async function sendClaimReceived(params: {
  to: string;
  contactName: string;
  listingTitle: string;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: p.to,
    replyTo: TEAM_INBOX,
    subject: `We received your claim for ${p.listingTitle}`,
    html: shell(
      `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.contactName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Thanks for claiming <strong>${esc(p.listingTitle)}</strong> on VakayGo. To protect your business from impersonation, a member of our team verifies every claim by phone before handing over the listing, usually within one business day.</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Once approved you can edit photos, pricing and availability, and bookings come straight to you.</p>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Questions? Reply to this email.</p>`,
      { eyebrow: "Claim received", title: p.listingTitle, tone: "gold" }
    ),
  });
}

export async function sendClaimToTeam(params: {
  claimId: string;
  listingTitle: string;
  listingUrl: string;
  islandName: string;
  listingPhone: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  roleAtBusiness: string | null;
  notes: string | null;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: TEAM_INBOX,
    replyTo: p.contactEmail,
    subject: `ACTION: listing claim — ${p.listingTitle} (${p.islandName})`,
    html: shell(
      `
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Verify by calling the number <strong>on the listing</strong> (not the one the claimant typed), then approve or reject in ${link("https://vakaygo.com/admin/claims", "admin → claims")}.</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Listing", link(p.listingUrl, p.listingTitle))}
        ${row("Island", esc(p.islandName))}
        ${row("Phone on listing", p.listingPhone ? esc(p.listingPhone) : "<em>none</em>")}
      </table>
    </div>
    <div style="background:#EAF4F4;border-radius:12px;padding:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Claimant", esc(p.contactName))}
        ${row("Role", p.roleAtBusiness ? esc(p.roleAtBusiness) : "—")}
        ${row("Phone given", esc(p.contactPhone))}
        ${row("Email", esc(p.contactEmail))}
        ${row("Notes", p.notes ? esc(p.notes) : "—")}
        ${row("Claim id", esc(p.claimId))}
      </table>
    </div>`,
      { eyebrow: "Listing claim", title: p.listingTitle, tone: "gold" }
    ),
  });
}

export async function sendClaimDecision(params: {
  to: string;
  contactName: string;
  listingTitle: string;
  approved: boolean;
  adminNotes: string | null;
}) {
  const p = params;
  const body = p.approved
    ? `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.contactName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Your claim is approved. <strong>${esc(p.listingTitle)}</strong> now lives in your dashboard. Add photos, set prices and availability, and every booking will come to you.</p>
    <p style="margin:24px 0 0;text-align:center"><a href="https://vakaygo.com/operator/listings" style="background:#C8912E;color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">Open my listing</a></p>
    ${p.adminNotes ? `<p style="color:#9A9DB0;font-size:12px;margin:16px 0 0">${esc(p.adminNotes)}</p>` : ""}`
    : `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.contactName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">We could not verify your claim for <strong>${esc(p.listingTitle)}</strong>${p.adminNotes ? `: ${esc(p.adminNotes)}` : "."}</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">If you own or manage this business, reply to this email and we will sort it out.</p>`;
  await sendEmail({
    from: FROM,
    to: p.to,
    replyTo: TEAM_INBOX,
    subject: p.approved ? `${p.listingTitle} is now yours on VakayGo` : `About your claim for ${p.listingTitle}`,
    html: shell(body, {
      eyebrow: p.approved ? "Claim approved" : "Claim update",
      title: p.listingTitle,
      tone: p.approved ? "teal" : "gold",
    }),
  });
}

// ─── Request outcomes (after the team phoned the business) ────────

export async function sendRequestConfirmed(params: {
  to: string;
  travelerName: string;
  bookingNumber: string;
  listingTitle: string;
  whenText: string;
  guestCount: number;
  businessPhone: string | null;
  note: string | null;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: p.to,
    replyTo: TEAM_INBOX,
    subject: `Confirmed by the business — ${p.listingTitle}`,
    html: shell(
      `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.travelerName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Good news: <strong>${esc(p.listingTitle)}</strong> has confirmed your request directly with us. You are booked. Nothing was charged through VakayGo${p.businessPhone ? " — any payment is settled with the business on the day" : ""}.</p>
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Reference", esc(p.bookingNumber))}
        ${row("When", esc(p.whenText))}
        ${row("Guests", String(p.guestCount))}
        ${p.businessPhone ? row("Business phone", esc(p.businessPhone)) : ""}
      </table>
    </div>
    ${p.note ? `<p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">${esc(p.note)}</p>` : ""}
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Plans changed? Reply to this email and we will let the business know.</p>`,
      { eyebrow: "Confirmed", title: p.listingTitle, tone: "teal" }
    ),
  });
}

export async function sendRequestDeclined(params: {
  to: string;
  travelerName: string;
  bookingNumber: string;
  listingTitle: string;
  reason: string | null;
  exploreUrl: string;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: p.to,
    replyTo: TEAM_INBOX,
    subject: `We couldn't confirm ${p.listingTitle}`,
    html: shell(
      `
    <p style="color:#1C2333;margin:0 0 16px">Hi ${esc(p.travelerName)},</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">We contacted <strong>${esc(p.listingTitle)}</strong> about request ${esc(p.bookingNumber)} and could not get it confirmed${p.reason ? `: ${esc(p.reason)}` : "."} Nothing was charged.</p>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6">Reply to this email if you would like us to try another date, or browse similar options: ${link(p.exploreUrl, "vakaygo.com/explore")}.</p>`,
      { eyebrow: "Request update", title: p.listingTitle, tone: "gold" }
    ),
  });
}

/** Team inbox: a dispute was filed. Previously this only created in-app
 *  notifications for admins — and there were none. */
export async function sendDisputeToTeam(params: {
  bookingNumber: string;
  reason: string;
  description: string;
  travelerName: string;
  travelerEmail: string;
}) {
  const p = params;
  await sendEmail({
    from: FROM,
    to: TEAM_INBOX,
    replyTo: p.travelerEmail,
    subject: `ACTION: dispute on ${p.bookingNumber} — ${p.reason.replace(/_/g, " ")}`,
    html: shell(
      `
    <div style="background:#F5EDD8;border-radius:12px;padding:16px;margin-bottom:16px">
      <table style="width:100%;font-size:14px;color:#4A4F73">
        ${row("Booking", esc(p.bookingNumber))}
        ${row("Reason", esc(p.reason.replace(/_/g, " ")))}
        ${row("Traveler", `${esc(p.travelerName)} · ${link(`mailto:${p.travelerEmail}`, p.travelerEmail)}`)}
      </table>
    </div>
    <p style="color:#4A4F73;margin:0 0 16px;line-height:1.6;white-space:pre-wrap">${esc(p.description)}</p>
    <p style="color:#9A9DB0;font-size:12px;margin:16px 0 0;line-height:1.5">Reply-to is the traveler. Resolve in ${link("https://vakaygo.com/admin/disputes", "admin → disputes")}.</p>`,
      { eyebrow: "Dispute filed", title: p.bookingNumber, tone: "gold" }
    ),
  });
}
