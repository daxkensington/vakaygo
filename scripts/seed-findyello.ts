/**
 * FindYello Import — businesses from findyello.com/grenada directory
 * Factual data only (names, categories, phones)
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200);
}

type Biz = { name: string; type: "stay" | "tour" | "dining" | "event" | "transport" | "guide"; category: string; phone?: string };

const businesses: Biz[] = [
  // DINING (new ones not already imported)
  { name: "YOLO Sushi Grenada", type: "dining", category: "Sushi", phone: "473-439-9656" },
  { name: "Adrift Restaurant & Bar", type: "dining", category: "Restaurant" },
  { name: "Cayenne Restaurant Grenada", type: "dining", category: "Fine Dining" },
  { name: "Indian Summer Restaurant", type: "dining", category: "Indian" },
  { name: "The Deck Restaurant at Le Phare Bleu", type: "dining", category: "Waterfront" },
  { name: "Petite Anse Hotel & Restaurant", type: "dining", category: "Hotel Restaurant" },
  { name: "Savvy's at Mount Cinnamon", type: "dining", category: "Restaurant" },
  { name: "East 95 Restaurant & Rooftop Lounge", type: "dining", category: "Rooftop" },
  { name: "Yaz Restaurant Grenada", type: "dining", category: "Restaurant" },
  { name: "Friday Restaurant & Bar", type: "dining", category: "Bar & Grill" },
  { name: "East West Restaurant & Bar", type: "dining", category: "Fusion" },
  { name: "Chez Louis Grenada", type: "dining", category: "French" },
  { name: "Cilantro Restaurant Grenada", type: "dining", category: "Restaurant" },
  { name: "Knife & Fork Port Louis", type: "dining", category: "Bistro" },
  { name: "Bananas Restaurant & Club", type: "dining", category: "Restaurant & Club" },
  { name: "Grill Master Restaurant & Lounge", type: "dining", category: "Grill" },
  { name: "Spice Isle Restaurant & Bar", type: "dining", category: "Caribbean" },
  { name: "Cafe Lola Grenada", type: "dining", category: "Cafe" },
  { name: "The Grind Coffee Shop", type: "dining", category: "Coffee" },
  { name: "Brown Girl Cafe", type: "dining", category: "Cafe" },
  { name: "Spice Isle Coffee Company", type: "dining", category: "Coffee" },
  { name: "Chai Cafe Grenada", type: "dining", category: "Cafe" },
  { name: "Sur La Mer Restaurant", type: "dining", category: "Seafood" },
  { name: "Brisa Mar Restaurant", type: "dining", category: "Restaurant" },
  { name: "The Big Dipper Restaurant & Bar", type: "dining", category: "Bar & Grill" },
  { name: "Beachside Bistrot Grenada", type: "dining", category: "Bistro" },
  { name: "Dre Flavors Restaurant & Catering", type: "dining", category: "Caribbean" },
  { name: "The Reef Grenada", type: "dining", category: "Seafood" },
  { name: "The Monkey Bar Grenada", type: "dining", category: "Bar" },
  { name: "Rocky's Beach Bar", type: "dining", category: "Beach Bar" },
  { name: "Tipsy Turtle Pub", type: "dining", category: "Pub" },
  { name: "Bossview Bar & Kitchen", type: "dining", category: "Bar & Kitchen" },
  { name: "West Indies Beer Company", type: "dining", category: "Brewery" },
  { name: "Roger's Barefoot Beach Bar", type: "dining", category: "Beach Bar" },
  { name: "Tims Sunset Beach Bar", type: "dining", category: "Beach Bar" },
  { name: "Sand Bar & Grill Grenada", type: "dining", category: "Beach Bar" },
  { name: "Doreen's Beach Restaurant & Lounge", type: "dining", category: "Beach Restaurant" },

  // STAYS (new)
  { name: "Gem Holiday Beach Resort", type: "stay", category: "Resort" },
  { name: "Two Bays Beach Villa", type: "stay", category: "Villa" },
  { name: "Sea Breeze Hotel Grenada", type: "stay", category: "Hotel" },
  { name: "Grooms Beach Villa & Resort", type: "stay", category: "Resort" },
  { name: "Le Phare Bleu Marina & Boutique Hotel", type: "stay", category: "Marina Hotel" },
  { name: "Grenadian by Rex Resorts", type: "stay", category: "Resort" },
  { name: "Silversands Grand Anse", type: "stay", category: "Luxury Hotel" },
  { name: "La Heliconia and Day Spa", type: "stay", category: "Spa Hotel" },
  { name: "Big Sky Lodge Grenada", type: "stay", category: "Lodge" },
  { name: "Rosa Guesthouse and Mom's Rotis", type: "stay", category: "Guesthouse" },
  { name: "Grenada Gold Guest House", type: "stay", category: "Guesthouse" },

  // TOURS (new)
  { name: "Funtastic River Tubing Grenada", type: "tour", category: "River Tubing" },
  { name: "Explorer Grenada Tours", type: "tour", category: "Tour Operator" },
  { name: "Grenada Excursions", type: "tour", category: "Tour Operator" },
  { name: "Grenada Island Excursions", type: "tour", category: "Tour Operator" },
  { name: "Above & Under Tours", type: "tour", category: "Tour Operator" },
  { name: "Grenada Full Day Tours", type: "tour", category: "Tour Operator" },
  { name: "Straw Hats Taxi & Tours", type: "tour", category: "Taxi Tour" },
  { name: "I'm Local Grenada Tours", type: "tour", category: "Local Guide" },
  { name: "Tour De Spice Grenada", type: "tour", category: "Spice Tour" },
  { name: "Home Hospitality Grenada", type: "tour", category: "Cultural" },
  { name: "Grenada Discovery Train", type: "tour", category: "Train Tour" },
  { name: "LTD Sailing Living the Dream", type: "tour", category: "Sailing" },
  { name: "Starwind Catamaran Sailing", type: "tour", category: "Sailing" },
  { name: "SeaHorse Sailing School", type: "tour", category: "Sailing School" },
  { name: "Grenada Bluewater Sailing", type: "tour", category: "Sailing" },
  { name: "Clarke's Court Rum Distillery Tour", type: "tour", category: "Distillery" },
  { name: "House of Chocolate Museum", type: "tour", category: "Museum" },
  { name: "Diamond Chocolate Factory Jouvay", type: "tour", category: "Chocolate Tour" },
  { name: "Tri-Island Chocolate Factory", type: "tour", category: "Chocolate Tour" },
  { name: "Hard Play Fishing Charters", type: "tour", category: "Fishing" },
  { name: "Spice Harmony Yoga Studio", type: "tour", category: "Yoga" },
  { name: "Namaste Yoga Studio Grenada", type: "tour", category: "Yoga" },
  { name: "Silversands Spa", type: "tour", category: "Spa" },
  { name: "Belle Lounge Luxury Spa", type: "tour", category: "Spa" },

  // TRANSPORT (new)
  { name: "Drive Grenada Car Rental", type: "transport", category: "Car Rental" },
  { name: "Safe Wheels Auto Rental", type: "transport", category: "Car Rental" },
  { name: "Signature Drive Grenada", type: "transport", category: "Car Rental" },
  { name: "Concept Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "First Stop Auto Rental", type: "transport", category: "Car Rental" },
  { name: "Two Seasons Rentals", type: "transport", category: "Car Rental" },
  { name: "Five Star Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Pure Rental Grenada", type: "transport", category: "Car Rental" },
  { name: "Sunset Auto Rental Grenada", type: "transport", category: "Car Rental" },
  { name: "Easy Wheels Grenada", type: "transport", category: "Car Rental" },

  // EVENTS (new)
  { name: "Moonlight City Grenada", type: "event", category: "Nightclub" },
  { name: "Club Fantazia Grenada", type: "event", category: "Nightclub" },
  { name: "Level Up Club Grenada", type: "event", category: "Nightclub" },
  { name: "Lavo Lanes Grenada", type: "event", category: "Entertainment" },
];

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  const [grenada] = await db.select({ id: islands.id }).from(islands).where(eq(islands.slug, "grenada")).limit(1);
  if (!grenada) { console.error("Run seed.ts first"); process.exit(1); }

  let [op] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!op) {
    [op] = await db.insert(users).values({
      email: "unclaimed@vakaygo.com", name: "Unclaimed Listing", role: "operator",
      businessName: "Unclaimed — Claim Your Business", islandId: grenada.id,
    }).returning({ id: users.id });
  }

  let imported = 0, skipped = 0;

  for (const biz of businesses) {
    const slug = slugify(biz.name);
    const existing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug)).limit(1);
    if (existing.length > 0) { skipped++; continue; }

    await db.insert(listings).values({
      operatorId: op.id,
      islandId: grenada.id,
      type: biz.type,
      status: "active",
      title: biz.name,
      slug,
      headline: `Discover ${biz.name} in Grenada`,
      description: `${biz.name} is a ${biz.category.toLowerCase()} in Grenada. This listing was created from public directory data — the business owner can claim it for free.`,
      typeData: { unclaimed: true, category: biz.category, phone: biz.phone || null, source: "findyello.com" },
      isFeatured: false,
      isInstantBook: false,
    });
    imported++;
  }

  console.log(`Imported: ${imported} | Skipped (duplicates): ${skipped} | Total in list: ${businesses.length}`);
}

main().catch(console.error);
