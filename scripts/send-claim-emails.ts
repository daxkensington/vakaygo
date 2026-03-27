/**
 * Send Claim Invitation Emails
 * Sends emails to unclaimed businesses inviting them to claim their VakayGo listing.
 *
 * Usage:
 *   DATABASE_URL=... RESEND_API_KEY=... npx tsx scripts/send-claim-emails.ts
 *
 * Options:
 *   --dry-run     Preview emails without sending
 *   --limit=50    Limit number of emails to send
 *   --island=grenada  Only send to businesses on specific island
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Resend } from "resend";
import { listings, islands } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_9veHwfmR_EfQt6FpKGS8MwUJgJcejmPDz";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 50;
const islandArg = args.find((a) => a.startsWith("--island="));
const islandFilter = islandArg ? islandArg.split("=")[1] : null;

function generateClaimEmail(businessName: string, islandName: string, listingSlug: string) {
  const claimUrl = `https://vakaygo.com/grenada/${listingSlug}`; // Will be dynamic per island

  return {
    subject: `${businessName} — Your listing is live on VakayGo`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#FEFCF7; font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px; margin:0 auto; padding:40px 24px;">

    <!-- Logo -->
    <div style="text-align:center; margin-bottom:32px;">
      <span style="font-size:28px; font-weight:bold; color:#1C2333;">Vakay<span style="color:#C8912E;">Go</span></span>
    </div>

    <!-- Hero -->
    <div style="background: linear-gradient(135deg, #C8912E 0%, #A87425 100%); border-radius:16px; padding:40px 32px; text-align:center; margin-bottom:24px;">
      <h1 style="color:#FFFFFF; font-size:24px; margin:0 0 12px 0; line-height:1.3;">
        ${businessName} is now on VakayGo
      </h1>
      <p style="color:rgba(255,255,255,0.8); font-size:16px; margin:0; line-height:1.5;">
        Travelers are discovering your business on the Caribbean's newest travel platform.
      </p>
    </div>

    <!-- Body -->
    <div style="background:#FFFFFF; border-radius:16px; padding:32px; margin-bottom:24px; box-shadow:0 2px 12px rgba(28,35,51,0.08);">
      <p style="color:#1C2333; font-size:16px; line-height:1.6; margin:0 0 16px 0;">
        Hi there,
      </p>
      <p style="color:#4A4F73; font-size:15px; line-height:1.6; margin:0 0 16px 0;">
        We've created a listing for <strong>${businessName}</strong> on VakayGo — the Caribbean's all-in-one travel platform for stays, tours, dining, events, and transport.
      </p>
      <p style="color:#4A4F73; font-size:15px; line-height:1.6; margin:0 0 24px 0;">
        Your listing is already visible to travelers searching ${islandName}. <strong>Claim it for free</strong> to:
      </p>

      <!-- Benefits -->
      <div style="margin-bottom:24px;">
        <div style="display:flex; align-items:flex-start; margin-bottom:12px;">
          <span style="color:#1A6B6A; font-size:18px; margin-right:12px;">✓</span>
          <span style="color:#4A4F73; font-size:14px; line-height:1.5;">Add photos, pricing, and availability</span>
        </div>
        <div style="display:flex; align-items:flex-start; margin-bottom:12px;">
          <span style="color:#1A6B6A; font-size:18px; margin-right:12px;">✓</span>
          <span style="color:#4A4F73; font-size:14px; line-height:1.5;">Start receiving bookings from travelers worldwide</span>
        </div>
        <div style="display:flex; align-items:flex-start; margin-bottom:12px;">
          <span style="color:#1A6B6A; font-size:18px; margin-right:12px;">✓</span>
          <span style="color:#4A4F73; font-size:14px; line-height:1.5;">Manage everything from one simple dashboard</span>
        </div>
        <div style="display:flex; align-items:flex-start; margin-bottom:12px;">
          <span style="color:#1A6B6A; font-size:18px; margin-right:12px;">✓</span>
          <span style="color:#4A4F73; font-size:14px; line-height:1.5;"><strong>Only 3% commission</strong> — the lowest in the industry</span>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center; margin:32px 0;">
        <a href="${claimUrl}" style="display:inline-block; background:#C8912E; color:#FFFFFF; text-decoration:none; padding:16px 40px; border-radius:12px; font-size:16px; font-weight:600;">
          Claim Your Listing — Free
        </a>
      </div>

      <!-- Comparison -->
      <div style="background:#F5EDD8; border-radius:12px; padding:20px; margin-top:24px;">
        <p style="color:#1C2333; font-size:14px; font-weight:600; margin:0 0 8px 0;">
          Why operators choose VakayGo:
        </p>
        <p style="color:#4A4F73; font-size:13px; line-height:1.6; margin:0;">
          Viator takes 25%. Airbnb takes 15%. <strong>VakayGo takes just 3%.</strong>
          <br>Free to list. Free dashboard. Free forever. You keep more of every booking.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center; padding:24px 0;">
      <p style="color:#9A9DB0; font-size:12px; margin:0 0 8px 0;">
        This email was sent because ${businessName} appears in public tourism directories for ${islandName}.
      </p>
      <p style="color:#9A9DB0; font-size:12px; margin:0;">
        VakayGo · Caribbean Travel Platform · <a href="https://vakaygo.com" style="color:#C8912E;">vakaygo.com</a>
      </p>
    </div>

  </div>
</body>
</html>
    `.trim(),
  };
}

async function main() {
  const db = drizzle(neon(DATABASE_URL));
  const resend = new Resend(RESEND_API_KEY);

  // Get unclaimed listings that have email/phone in typeData
  const conditions = [
    eq(listings.status, "active"),
    sql`(${listings.typeData}->>'unclaimed')::boolean = true`,
  ];

  if (islandFilter) {
    const [island] = await db.select({ id: islands.id }).from(islands).where(eq(islands.slug, islandFilter)).limit(1);
    if (island) conditions.push(eq(listings.islandId, island.id));
  }

  const unclaimedListings = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      typeData: listings.typeData,
      islandName: islands.name,
    })
    .from(listings)
    .innerJoin(islands, eq(listings.islandId, islands.id))
    .where(and(...conditions))
    .limit(limit);

  console.log(`Found ${unclaimedListings.length} unclaimed listings`);
  if (dryRun) console.log("DRY RUN — no emails will be sent\n");

  let sent = 0;
  let skipped = 0;

  for (const listing of unclaimedListings) {
    const td = listing.typeData as Record<string, unknown> | null;
    const email = td?.email as string | undefined;
    const website = td?.website as string | undefined;

    // We need an email to send to — skip if none
    if (!email) {
      // Try to construct from website domain
      if (website) {
        try {
          const domain = new URL(website).hostname.replace("www.", "");
          const guessedEmail = `info@${domain}`;
          console.log(`  ${listing.title}: No email, guessing ${guessedEmail} from website`);
          // In production, you'd want to verify these
        } catch {
          // invalid URL
        }
      }
      skipped++;
      continue;
    }

    const emailContent = generateClaimEmail(listing.title, listing.islandName, listing.slug);

    if (dryRun) {
      console.log(`  Would send to: ${email}`);
      console.log(`  Subject: ${emailContent.subject}`);
      console.log(`  Business: ${listing.title}`);
      console.log();
      sent++;
      continue;
    }

    try {
      await resend.emails.send({
        from: "VakayGo <hello@vakaygo.com>",
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
      sent++;
      console.log(`  ✓ Sent to ${email} — ${listing.title}`);

      // Rate limit: 2 emails per second
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ✗ Failed: ${listing.title}`, err);
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped (no email): ${skipped}`);
}

main().catch(console.error);
