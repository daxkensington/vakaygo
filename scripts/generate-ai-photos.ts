/**
 * Generate AI photos for listings without images using Grok
 * Creates type-specific Caribbean images for each listing category
 *
 * Usage: DATABASE_URL=... GROK_API_KEY=... npx tsx scripts/generate-ai-photos.ts
 * Options:
 *   --limit=50     Process N listings (default 50)
 *   --type=excursion  Only process specific type
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings, media, islands } from "../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const GROK_API_KEY = process.env.GROK_API_KEY!;

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 50;
const typeArg = args.find((a) => a.startsWith("--type="));
const typeFilter = typeArg ? typeArg.split("=")[1] : null;

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

  // Get listings without photos
  const conditions = [eq(listings.status, "active")];
  if (typeFilter) {
    conditions.push(eq(listings.type, typeFilter as any));
  }

  const listingsWithoutPhotos = await db
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

  console.log(`Found ${listingsWithoutPhotos.length} listings without photos\n`);

  // Track which prompts we've used per type to avoid duplicates
  const promptIndex: Record<string, number> = {};
  let generated = 0;

  for (const listing of listingsWithoutPhotos) {
    const prompts = typePrompts[listing.type] || typePrompts.tour;

    // Rotate through prompts for variety
    if (!promptIndex[listing.type]) promptIndex[listing.type] = 0;
    const prompt = prompts[promptIndex[listing.type] % prompts.length];
    promptIndex[listing.type]++;

    const imageUrl = await generateImage(prompt);

    if (imageUrl) {
      await db.insert(media).values({
        listingId: listing.id,
        url: imageUrl,
        alt: listing.title,
        type: "image",
        sortOrder: 0,
        isPrimary: true,
      });
      generated++;
      process.stdout.write(".");
    } else {
      process.stdout.write("x");
    }

    // Rate limit — Grok has limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n\nGenerated ${generated} AI images for ${listingsWithoutPhotos.length} listings`);
}

main().catch(console.error);
