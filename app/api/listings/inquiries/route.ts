import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { interestResponse, sameOriginMutation } from "@/server/interest-http";
import { isListingId } from "@/lib/listing-interest";
import { sendListingInquiryReceived, sendListingInquiryToTeam } from "@/server/email-requests";
import { logger } from "@/lib/logger";

function validDate(value: unknown): string | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : false;
}

function errorMessage(error: unknown) {
  const candidate = error as { message?: string; cause?: { message?: string } };
  return candidate?.cause?.message || candidate?.message || "";
}

export async function POST(request: NextRequest) {
  if (!sameOriginMutation(request)) return interestResponse({ error: "Invalid request origin or content type." }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return interestResponse({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return interestResponse({ error: "Invalid request." }, 400);
  if (body.website !== undefined && (typeof body.website !== "string" || body.website.length > 200)) return interestResponse({ error: "Invalid request." }, 400);
  if (typeof body.website === "string" && body.website.trim()) return interestResponse({ success: true });
  if (!isListingId(body.listingId) || typeof body.email !== "string" || body.email.length > 254 ||
    typeof body.partySize !== "number" || !Number.isInteger(body.partySize) || body.partySize < 1 || body.partySize > 100 ||
    (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 2000))) {
    return interestResponse({ error: "Please check the inquiry details and try again." }, 400);
  }
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return interestResponse({ error: "Enter a valid email address." }, 400);
  const startDate = validDate(body.startDate);
  const endDate = validDate(body.endDate);
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = new Date(Date.now() + 730 * 86_400_000).toISOString().slice(0, 10);
  if (startDate === false || endDate === false || (startDate && (startDate < today || startDate > lastDate)) ||
    (endDate && (!startDate || endDate < startDate || endDate > lastDate))) {
    return interestResponse({ error: "Choose valid dates within the next two years." }, 400);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const whenText = startDate ? (endDate && endDate !== startDate ? `${startDate} to ${endDate}` : startDate) : "Flexible / not specified";

  try {
    const db = neon(process.env.DATABASE_URL!);
    const [created] = await db.query(
      "SELECT * FROM vakaygo_create_listing_inquiry($1,$2,$3,$4,$5,$6)",
      [body.listingId, email, startDate, endDate, body.partySize, message]
    ) as { inquiry_id: string; created: boolean }[];
    if (!created?.inquiry_id) return interestResponse({ error: "This listing is not accepting inquiries right now." }, 409);
    const [inquiry] = await db.query(
      `SELECT i.id, i.team_notified_at, i.traveler_notified_at,
        l.title, l.slug, l.type_data->>'phone' AS business_phone, l.type_data->>'website' AS business_website,
        islands.name AS island_name, islands.slug AS island_slug
       FROM listing_inquiries i JOIN listings l ON l.id=i.listing_id JOIN islands ON islands.id=l.island_id
       WHERE i.id=$1 AND i.listing_id=$2`,
      [created.inquiry_id, body.listingId]
    ) as {
      id: string; team_notified_at: string | null; traveler_notified_at: string | null;
      title: string; slug: string; business_phone: string | null; business_website: string | null;
      island_name: string; island_slug: string;
    }[];
    if (!inquiry) return interestResponse({ error: "This listing is not accepting inquiries right now." }, 409);
    const listingUrl = `https://vakaygo.com/${encodeURIComponent(inquiry.island_slug)}/${encodeURIComponent(inquiry.slug)}`;

    if (!inquiry.team_notified_at) {
      const [claim] = await db.query(
        "UPDATE listing_inquiries SET team_notified_at=now() WHERE id=$1 AND team_notified_at IS NULL RETURNING team_notified_at",
        [inquiry.id]
      ) as { team_notified_at: string }[];
      if (claim) {
        try {
          await sendListingInquiryToTeam({
            inquiryId: inquiry.id,
            listingTitle: inquiry.title,
            listingUrl,
            islandName: inquiry.island_name,
            businessPhone: inquiry.business_phone,
            businessWebsite: inquiry.business_website,
            whenText,
            partySize: body.partySize,
            message,
            travelerEmail: email,
          });
        } catch (error) {
          await db.query("UPDATE listing_inquiries SET team_notified_at=NULL WHERE id=$1 AND team_notified_at=$2", [inquiry.id, claim.team_notified_at]).catch(() => {});
          logger.error("Listing inquiry team notification failed", error);
          return interestResponse({ error: "Your inquiry is saved, but our team notification did not finish. Please retry in a moment.", code: "INQUIRY_SAVED", inquiryId: inquiry.id }, 503);
        }
      }
    }

    if (!inquiry.traveler_notified_at) {
      const [claim] = await db.query(
        "UPDATE listing_inquiries SET traveler_notified_at=now() WHERE id=$1 AND traveler_notified_at IS NULL RETURNING traveler_notified_at",
        [inquiry.id]
      ) as { traveler_notified_at: string }[];
      if (claim) {
        try {
          await sendListingInquiryReceived({ to: email, listingTitle: inquiry.title, listingUrl, whenText, partySize: body.partySize });
        } catch (error) {
          await db.query("UPDATE listing_inquiries SET traveler_notified_at=NULL WHERE id=$1 AND traveler_notified_at=$2", [inquiry.id, claim.traveler_notified_at]).catch(() => {});
          logger.error("Listing inquiry acknowledgement failed", error);
        }
      }
    }
    return interestResponse({ success: true, inquiryId: inquiry.id, duplicate: !created.created });
  } catch (error) {
    const detail = errorMessage(error);
    if (detail.includes("VG_INQUIRY:INPUT")) return interestResponse({ error: "Please check the inquiry details and try again." }, 400);
    if (detail.includes("VG_INQUIRY:UNAVAILABLE")) return interestResponse({ error: "This listing is not accepting inquiries right now." }, 409);
    if (detail.includes("VG_INQUIRY:LIMIT")) return interestResponse({ error: "You have sent several inquiries today. Please try again tomorrow." }, 429);
    logger.error("Listing inquiry failed", error);
    return interestResponse({ error: "Could not send your inquiry. Please try again." }, 503);
  }
}
