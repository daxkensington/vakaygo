/**
 * Generate AI photos for listings without reliable images using Grok
 * Creates type-specific Caribbean images for each listing category
 *
 * Usage: DATABASE_URL=... GROK_API_KEY=... npx tsx scripts/generate-ai-photos.ts
 * Options:
 *   --limit=50         Process N listings (default 50)
 *   --type=excursion   Only process specific type
 *   --google-only      Target listings whose only images are Google Places URLs
 *   --concurrency=3    Parallel requests (default 3)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "../drizzle/schema";
import { eq, and, isNull, sql, not, like } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GROK_API_KEY = process.env.GROK_API_KEY!;

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 50;
const typeArg = args.find((a) => a.startsWith("--type="));
const typeFilter = typeArg ? typeArg.split("=")[1] : null;
const googleOnly = args.includes("--google-only");
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1]) : 3;

// Type-specific prompts for generating relevant Caribbean images
const typePrompts: Record<string, string[]> = {
  excursion: [
    "Luxury catamaran sailing through turquoise Caribbean waters with snorkelers in crystal clear water, tropical island in background, golden hour",
    "Group of travelers on a speed boat excursion between lush green Caribbean islands, turquoise sea, spray, blue sky adventure",
    "Snorkeling excursion over vibrant coral reef in crystal clear Caribbean water, tropical fish, sunshine, underwater beauty",
    "Sunset sailing cruise in the Caribbean, golden sky reflected on calm turquoise water, silhouette of sailboat, romantic atmosphere",
    "Caribbean island hopping by boat, approaching a white sand beach with palm trees, turquoise lagoon, paradise",
    "Fishing charter boat in deep blue Caribbean waters, sport fishing, tropical setting, ocean adventure",
    "Kayaking through mangroves in calm Caribbean water, eco tour, tropical nature, adventure excursion",
    "Parasailing over turquoise Caribbean beach, aerial view, white sand below, blue sky, adrenaline adventure",
  ],
  transfer: [
    "Professional black SUV parked at Caribbean airport arrivals area, driver in uniform holding name sign, tropical palm trees, warm light",
    "Luxury sedan arriving at Caribbean beachfront resort entrance, bellman greeting, tropical landscaping, VIP transfer",
    "Clean white minivan airport shuttle at Caribbean terminal, professional service, luggage loading, palm trees",
    "Premium private car service at Caribbean airport, chauffeur opening door, luxury vehicle, professional transfer",
    "Airport taxi line at tropical Caribbean airport, organized fleet of vehicles, palm trees, warm sunny day",
  ],
  vip: [
    "VIP lounge at Caribbean airport with panoramic tropical views, luxury seating, champagne, exclusive service",
    "Professional concierge in white suit at luxury Caribbean resort entrance, premium service, tropical elegance",
    "Luxury black armored SUV convoy at Caribbean estate, executive protection, professional security, discreet",
    "VIP meet and greet at Caribbean airport terminal, personal assistant with name board, fast track, exclusive",
    "Private security detail escorting VIP at Caribbean luxury event, professional, discreet, premium service",
  ],
  stay: [
    "Caribbean beachfront villa with infinity pool overlooking turquoise ocean, tropical garden, luxury accommodation",
    "Cozy Caribbean guesthouse with colorful shutters, tropical flowers, hammock on veranda, warm light",
    "Boutique hotel room with ocean view balcony in the Caribbean, white linens, tropical decor, sunrise",
  ],
  tour: [
    "Walking tour group in colorful Caribbean colonial town, local guide pointing at historic building, vibrant culture",
    "Cultural tour visiting Caribbean spice plantation, nutmeg and cocoa trees, local guide explaining, lush greenery",
    "Sightseeing tour at Caribbean waterfall, group of travelers, lush rainforest, natural pool, adventure",
  ],
  dining: [
    "Beachfront Caribbean restaurant at sunset, tables on sand, tiki torches, fresh seafood platter, ocean view",
    "Colorful Caribbean street food vendor, local cuisine, grilled fish, tropical fruits, vibrant atmosphere",
    "Fine dining at Caribbean waterfront restaurant, candlelit table, sunset view, gourmet Caribbean cuisine",
  ],
  event: [
    "Caribbean carnival celebration with colorful costumes, soca music, dancing crowd, vibrant energy, festival",
    "Beach party at sunset in the Caribbean, DJ booth, dancing, tropical cocktails, fairy lights, celebration",
  ],
  transport: [
    "Caribbean car rental lot with diverse vehicles, tropical setting, palm trees, island driving adventure",
    "Water taxi at Caribbean dock, turquoise water, tropical harbor, island transport",
  ],
  guide: [
    "Local Caribbean guide leading hikers through tropical rainforest trail, pointing at rare bird, nature expert",
    "Caribbean food tour guide at local market, showing tropical spices and fruits, authentic cultural experience",
  ],
};

async function generateImage(prompt: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: `${prompt}, professional travel photography, cinematic quality, vibrant colors`,
        n: 1,
      }),
    });

    const data = await res.json();
    return data.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

async function main() {
  if (!GROK_API_KEY) {
    console.error("GROK_API_KEY required. Set it or read from ~/.claude/.env");
    process.exit(1);
  }

  const db = drizzle(neon(DATABASE_URL));

  let listingsToProcess: { id: string; title: string; type: string; islandId: number }[];

  if (googleOnly) {
    // Find listings whose ONLY images are Google Places URLs (likely broken/expired)
    const typeCondition = typeFilter
      ? sql`AND l.type = ${typeFilter}`
      : sql``;

    const result = await db.execute(sql`
      SELECT l.id, l.title, l.type, l.island_id as "islandId"
      FROM listings l
      WHERE l.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM media m
          WHERE m.listing_id = l.id
          AND m.url NOT LIKE '%googleapis.com%'
        )
        AND EXISTS (
          SELECT 1 FROM media m2
          WHERE m2.listing_id = l.id
        )
        ${typeCondition}
      LIMIT ${limit}
    `);
    listingsToProcess = result.rows as any;
  } else {
    // Original: listings with zero media rows
    const conditions = [eq(listings.status, "active")];
    if (typeFilter) {
      conditions.push(eq(listings.type, typeFilter as any));
    }

    listingsToProcess = await db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        islandId: listings.islandId,
      })
      .from(listings)
      .leftJoin(media, eq(listings.id, media.listingId))
      .where(and(...conditions, isNull(media.id)))
      .limit(limit);
  }

  const mode = googleOnly ? "google-only" : "no-media";
  console.log(`[${mode}] Found ${listingsToProcess.length} listings to process (concurrency=${concurrency})\n`);

  if (listingsToProcess.length === 0) {
    console.log("Nothing to do!");
    return;
  }

  // Track which prompts we've used per type to avoid duplicates
  const promptIndex: Record<string, number> = {};
  let generated = 0;
  let failed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < listingsToProcess.length; i += concurrency) {
    const batch = listingsToProcess.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (listing) => {
        const prompts = typePrompts[listing.type] || typePrompts.tour;

        if (!promptIndex[listing.type]) promptIndex[listing.type] = 0;
        const prompt = prompts[promptIndex[listing.type] % prompts.length];
        promptIndex[listing.type]++;

        const imageUrl = await generateImage(prompt);

        if (imageUrl) {
          // Clear isPrimary from existing google images, set new one as primary
          await db
            .update(media)
            .set({ isPrimary: false })
            .where(eq(media.listingId, listing.id));

          await db.insert(media).values({
            listingId: listing.id,
            url: imageUrl,
            alt: listing.title,
            type: "image",
            sortOrder: 0,
            isPrimary: true,
          });
          return true;
        }
        return false;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        generated++;
        process.stdout.write(".");
      } else {
        failed++;
        process.stdout.write("x");
      }
    }

    // Rate limit between batches
    if (i + concurrency < listingsToProcess.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`\n\nDone: ${generated} generated, ${failed} failed out of ${listingsToProcess.length} listings`);
}

main().catch(console.error);
