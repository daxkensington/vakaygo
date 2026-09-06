import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUser } from "@/server/admin-auth";
import { interestResponse, sameOriginMutation } from "@/server/interest-http";
import { INTEREST_NOTICE_VERSION, isListingId } from "@/lib/listing-interest";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.error;
  const listingId = request.nextUrl.searchParams.get("listingId");
  if (!isListingId(listingId)) return interestResponse({ error: "Invalid listing." }, 400);
  try {
    const db = neon(process.env.DATABASE_URL!);
    const [row] = await db.query("SELECT active FROM listing_interest WHERE listing_id=$1 AND user_id=$2", [listingId, auth.userId]);
    return interestResponse({ interested: row?.active === true });
  } catch { return interestResponse({ error: "Could not load your interest. Please retry." }, 503); }
}

export async function POST(request: NextRequest) {
  if (!sameOriginMutation(request)) return interestResponse({ error: "Invalid request origin or content type." }, 403);
  const auth = await requireUser();
  if (!auth.ok) return auth.error;
  let body;
  try { body = await request.json(); } catch { return interestResponse({ error: "Invalid request." }, 400); }
  if (!body || !isListingId(body.listingId) || typeof body.interested !== "boolean" ||
    (body.interested && body.noticeVersion !== INTEREST_NOTICE_VERSION)) return interestResponse({ error: "Please refresh the page and try again." }, 400);
  try {
    const db = neon(process.env.DATABASE_URL!);
    const [row] = await db.query("SELECT vakaygo_record_listing_interest($1,$2,$3,$4) interested", [body.listingId, auth.userId, auth.sessionVersion, body.interested]);
    return interestResponse({ interested: row.interested === true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("VG_INTEREST:SESSION")) return interestResponse({ error: "Please sign in again." }, 401);
    if (message.includes("VG_INTEREST:VERIFY_EMAIL")) return interestResponse({ error: "Verify your email before recording interest." }, 403);
    if (message.includes("VG_INTEREST:NOT_FOUND")) return interestResponse({ error: "This listing is no longer available." }, 404);
    if (message.includes("VG_INTEREST:OWN_LISTING")) return interestResponse({ error: "Business owners and administrators cannot add interest to their own listings." }, 403);
    if (message.includes("VG_INTEREST:LIMIT")) return interestResponse({ error: "You have reached the daily interest limit. Please try again tomorrow." }, 429);
    return interestResponse({ error: "Could not save your interest. Please retry." }, 503);
  }
}
