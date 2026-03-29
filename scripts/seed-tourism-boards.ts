/**
 * Tourism Board Import — 258 businesses from official tourism directories
 * Sources: discoversvg.com, bonaireisland.com, aruba.com, nevisisland.com, destinationsaintlucia.com
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200); }

type Biz = { name: string; type: "stay" | "tour" | "dining" | "event" | "transport" | "guide"; category: string; island: string };

const businesses: Biz[] = [
  // ST. VINCENT
  ...(["A Taste Of Freedom Apartment","Adams Apartments","Bascombe Apartments","Bay Tree Villa","Beachcombers Hotel","Bequia Beach Hotel Resort","Bequia Plantation Hotel","Blue Lagoon Hotel & Marina","Calliandras Apartment Complex","Canouan Estate Resort & Villas","Grenadine House","Holiday Inn Express Diamond","Hotel Alexandrina","Kings Landing Hotel","Mandarin Oriental SVG","Palm Island Resort","Rosewood Apartment Hotel","Royal Bliss Apartment Suites","Sandy Lane Yacht Club","Spring Gardens Resort","Spring Hotel","Sugarapple Inn","Sunset Point Suites","Tenuta Chatham Bay Resort","The Lookout Boutique Villa","Young Island Resort"] as const).map(n => ({ name: n, type: "stay" as const, category: "Accommodation", island: "st-vincent" })),

  // BONAIRE
  ...(["Bamboo Bonaire Boutique Resort","Bella Breeze Resort Bonaire","Belmar Oceanfront Apartments","Black Durgon Inn","Bloozz Resort Bonaire","Boutique Hotel Bougainvillea","Boutique Hotel Sonrisa Bonaire","Bridanda Boutique Resort","Buddy Dive Resort","Habitat Bonaire","Caribbean Club Bonaire","Chogogo Dive & Beach Resort","Coral Paradise Resort","Corallium Hotel & Villas","Delfins Beach Resort","Den Laman Condominiums","Divi Flamingo Beach Resort Bonaire","Eco Lodge Bonaire","Grand Windsock Bonaire","Hamlet Oasis Resort","Harbour Village Beach Club","Heritage Design Inn","One Ocean Bonaire","Red Palm Village","Resort Bonaire","Sand Dollar Bonaire","SENSES Boutique Hotel","Sorobon Luxury Beach Resort","Tala Lodge Bonaire","The Bellafonte","Van der Valk Plaza Resort Bonaire","Waterlands Village Bonaire","Windhoek Resort Bonaire"] as const).map(n => ({ name: n, type: "stay" as const, category: "Accommodation", island: "bonaire" })),

  // ARUBA
  ...(["Hyatt Place Aruba Airport","Embassy Suites by Hilton Aruba","Radisson Blu Aruba","Montana Eco Resort","Secrets Baby Beach Aruba","The St. Regis Aruba Resort","JOIA Aruba by Iberostar","Courtyard by Marriott Aruba","The Mill Resort & Suites Aruba","Amsterdam Manor Beach Resort","La Cabana Beach Resort Aruba","Caribbean Palm Village Resort","MVC Eagle Beach Aruba","Tierra del Sol Resort & Golf","Renaissance Wind Creek Aruba","Playa Linda Beach Resort Aruba","Divi Village Golf & Beach Resort","RIU Palace Antillas Aruba","Holiday Inn Aruba Beach Resort","The Ritz-Carlton Aruba","Hilton Aruba Caribbean Resort","Barcelo Aruba","Bucuti & Tara Beach Resort","Divi Aruba All Inclusive","Tamarijn Aruba All Inclusive","RIU Palace Aruba","Aruba Marriott Resort","Manchebo Beach Resort & Spa","Boardwalk Boutique Hotel Aruba","Hyatt Regency Aruba","Eagle Aruba Resort"] as const).map(n => ({ name: n, type: "stay" as const, category: "Hotel/Resort", island: "aruba" })),

  // NEVIS
  ...(["Four Seasons Resort Nevis","Golden Rock Inn","Hamilton Beach Villas & Spa","Mount Nevis Hotel","Montpelier Nevis","Oualie Beach Resort","Paradise Beach Nevis","The Hermitage Nevis"] as const).map(n => ({ name: n, type: "stay" as const, category: "Hotel", island: "st-kitts" })),
  ...(["Yachtsman Grill at Hamilton Beach","Luna Restaurant Nevis","Indian Summer Nevis","Drift Restaurant & V Gallery","Nevis Peak Brewery Pub","Chrishi Beach Club","On the Dune at Four Seasons","Mango at Four Seasons Nevis"] as const).map(n => ({ name: n, type: "dining" as const, category: "Restaurant", island: "st-kitts" })),

  // ST. LUCIA - Boutique Hotels
  ...(["Anse Chastanet","Rabot Hotel by Hotel Chocolat","Calabash Cove Resort & Spa","Cap Maison St Lucia","Capella Marigot Bay","Coco Palm St Lucia","East Winds Inn","Fond Doux Plantation","Jade Mountain","Ladera Resort","Stonefield Estate Resort","Sugarbeach a Viceroy Resort","Tet Rouge St Lucia","Ti Kaye Resort & Spa"] as const).map(n => ({ name: n, type: "stay" as const, category: "Boutique Hotel", island: "st-lucia" })),
  // ST. LUCIA - Large Hotels
  ...(["Coconut Bay Resort & Spa","Rendezvous St Lucia","Sandals Grande St Lucia","Sandals Halcyon Beach","Sandals La Toc","St. James Club Morgan Bay","Starfish St Lucia Resort","BodyHoliday Saint Lucia","Bay Gardens Beach Resort","Bay Gardens Hotel","Harbor Club St Lucia","Marigot Bay Resort & Marina","Royalton Saint Lucia","The Landings St Lucia","Windjammer Landing"] as const).map(n => ({ name: n, type: "stay" as const, category: "Resort", island: "st-lucia" })),
  // ST. LUCIA - Restaurants
  ...(["Caribbean Pirates Restaurant","Antillia Brewery","Pink Papaya St Lucia","Jacques Waterfront Dining","Spinnakers Saint Lucia","Buzz Seafood and Grill","Big Chef Steakhouse","Spice of India St Lucia","La Mesa Restaurant","Matthew's Rooftop Restaurant","Chateau Mygo","Cafe Ole St Lucia","Amici Restaurant St Lucia","Orlando's Restaurant Soufriere"] as const).map(n => ({ name: n, type: "dining" as const, category: "Restaurant", island: "st-lucia" })),
  // ST. LUCIA - Activities
  ...(["Hackshaw Boat Charters","Endless Summer Cruises St Lucia","Island Lady Charters","Jus Sail Ltd","Treasure Bay Casino","The Reef Kite + Surf","See St Lucia Mini Cooper Road Trip","Finest Touring Service","Tet Paul Nature Trail","Rain Forest Sky Rides St Lucia","Saint Lucia Helicopters","Sea Spray Cruises","Trims Riding Center","Cosol Tours St Lucia","Hibiscus Tours St Lucia"] as const).map(n => ({ name: n, type: "tour" as const, category: "Activity", island: "st-lucia" })),
];

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  let [op] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!op) {
    [op] = await db.insert(users).values({ email: "unclaimed@vakaygo.com", name: "Unclaimed Listing", role: "operator", businessName: "Unclaimed" }).returning({ id: users.id });
  }

  // Cache island IDs
  const islandCache: Record<string, number> = {};
  const allIslands = await db.select({ id: islands.id, slug: islands.slug }).from(islands);
  allIslands.forEach(i => { islandCache[i.slug] = i.id; });

  let imported = 0, skipped = 0;

  for (const biz of businesses) {
    const islandId = islandCache[biz.island];
    if (!islandId) { console.log(`  Skip: ${biz.name} (island ${biz.island} not found)`); skipped++; continue; }

    const slug = slugify(biz.name);
    const existing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug)).limit(1);
    if (existing.length > 0) { skipped++; continue; }

    await db.insert(listings).values({
      operatorId: op.id, islandId, type: biz.type, status: "active",
      title: biz.name, slug,
      headline: `Discover ${biz.name}`,
      description: `${biz.name} — a ${biz.category.toLowerCase()} listed on the official tourism directory. Claim this listing for free to add photos, pricing, and start receiving bookings.`,
      typeData: { unclaimed: true, category: biz.category, source: "tourism-board" },
      isFeatured: false, isInstantBook: false,
    });
    imported++;
  }

  console.log(`Imported: ${imported} | Skipped: ${skipped} | Total: ${businesses.length}`);
}

main().catch(console.error);
