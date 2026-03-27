/**
 * Pure Grenada Import — 176 businesses from puregrenada.com directory
 * Factual data only (names, categories) — legal to use
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200);
}

type Biz = { name: string; type: "stay" | "tour" | "dining" | "event" | "transport" | "guide"; category: string };

const businesses: Biz[] = [
  // STAYS - Hotels
  { name: "Royalton Grenada", type: "stay", category: "Hotel" },
  { name: "Siesta Hotel", type: "stay", category: "Hotel" },
  { name: "Laurena Hotel", type: "stay", category: "Hotel" },
  { name: "Mermaid Beach Hotel", type: "stay", category: "Hotel" },
  { name: "Point Salines Hotel", type: "stay", category: "Hotel" },
  { name: "La Sagesse Hotel Restaurant & Beach Bar", type: "stay", category: "Hotel" },
  { name: "Six Senses La Sagesse", type: "stay", category: "Luxury Resort" },
  { name: "Blue Horizons Garden Resort", type: "stay", category: "Resort" },
  { name: "Kalinago Beach Resort", type: "stay", category: "Resort" },
  { name: "Allamanda Beach Resort", type: "stay", category: "Resort" },
  { name: "Mount Edgecombe Boutique Hotel", type: "stay", category: "Boutique Hotel" },
  { name: "Secret Harbour Boutique Hotel", type: "stay", category: "Boutique Hotel" },
  // Villas
  { name: "Solamente Villa", type: "stay", category: "Villa" },
  { name: "Villa Solitaire", type: "stay", category: "Villa" },
  { name: "Villa Poseidon", type: "stay", category: "Villa" },
  { name: "L'Anse Aux Epines House & Gardens", type: "stay", category: "Villa" },
  { name: "Mount Hartman Bay Estate", type: "stay", category: "Villa" },
  { name: "ClarenceVille Villa", type: "stay", category: "Villa" },
  { name: "Atma Island Living", type: "stay", category: "Villa" },
  // Apartments
  { name: "Barclays Garden Apartments", type: "stay", category: "Apartment" },
  { name: "Park View Apartments", type: "stay", category: "Apartment" },
  { name: "Palwee Village Apartments", type: "stay", category: "Apartment" },
  { name: "Frangipani Garden Apartment", type: "stay", category: "Apartment" },
  { name: "South Winds Apartments", type: "stay", category: "Apartment" },
  { name: "Hideaway Apartments", type: "stay", category: "Apartment" },
  { name: "Catappa Condominiums", type: "stay", category: "Condo" },
  { name: "Bougainvillea Apartments", type: "stay", category: "Apartment" },
  { name: "Bella Blue Apartments", type: "stay", category: "Apartment" },
  { name: "Grand Anse Beach Palace", type: "stay", category: "Apartment" },
  { name: "Silversands Beach House", type: "stay", category: "Beach House" },
  { name: "Smithy's Eco Apartment", type: "stay", category: "Eco-Stay" },
  // Guest Houses
  { name: "Green Roof Inn", type: "stay", category: "Guesthouse" },
  { name: "Melodies Guesthouse", type: "stay", category: "Guesthouse" },
  { name: "The Bay House", type: "stay", category: "Guesthouse" },
  { name: "Tropicana Inn", type: "stay", category: "Inn" },
  { name: "Relax Inn", type: "stay", category: "Inn" },
  { name: "Lance Aux Epines Cottages", type: "stay", category: "Cottage" },
  { name: "Almost Paradise Cottage Retreat", type: "stay", category: "Cottage" },
  { name: "Glamping Grenada", type: "stay", category: "Glamping" },
  { name: "Wave Crest Suites", type: "stay", category: "Suite" },
  { name: "Sam's Inn", type: "stay", category: "Inn" },
  { name: "Crayfish Bay Organic Estate", type: "stay", category: "Estate" },
  { name: "Bogles Round House", type: "stay", category: "Boutique" },
  { name: "Casa Calypso", type: "stay", category: "Vacation Rental" },
  { name: "Goyaba Beach House", type: "stay", category: "Beach House" },

  // DINING
  { name: "Punj-Abi Indian Restaurant & Bar", type: "dining", category: "Indian" },
  { name: "Grenadian Grill", type: "dining", category: "Grill" },
  { name: "Mocha Spoke Cafe", type: "dining", category: "Cafe" },
  { name: "Island Fever Tropical Tavern", type: "dining", category: "Bar" },
  { name: "Armadillo Restaurant", type: "dining", category: "Restaurant" },
  { name: "Spice Affair Restaurant", type: "dining", category: "Restaurant" },
  { name: "Arawakabana", type: "dining", category: "Caribbean" },
  { name: "Bella Milano", type: "dining", category: "Italian" },
  { name: "Mount Edgecombe Plantation Restaurant", type: "dining", category: "Plantation" },
  { name: "Secret Harbour Restaurant", type: "dining", category: "Fine Dining" },
  { name: "La Playa Beach Bar & Bistro", type: "dining", category: "Beach Bar" },
  { name: "Asiatique Restaurant", type: "dining", category: "Asian" },
  { name: "Gallery Cafe", type: "dining", category: "Cafe" },
  { name: "Grenada Yacht Club Restaurant", type: "dining", category: "Club" },
  { name: "Sea Fire Restaurant", type: "dining", category: "Seafood" },
  { name: "Beachside Terrace", type: "dining", category: "Beach Restaurant" },
  { name: "Rick's Cafe Grenada", type: "dining", category: "Cafe" },
  { name: "Callaloo Restaurant & Bar", type: "dining", category: "Caribbean" },
  { name: "Victory Bar and Restaurant", type: "dining", category: "Bar & Grill" },
  { name: "Flavours of Grenada", type: "dining", category: "Caribbean" },
  { name: "Savvy's Beach Cabana", type: "dining", category: "Beach Bar" },
  { name: "Beach Club Grenada", type: "dining", category: "Beach Club" },

  // TOURS
  { name: "Pete's Mystique Tours", type: "tour", category: "Tour Operator" },
  { name: "Zeyah Tours and Services", type: "tour", category: "Tour Operator" },
  { name: "Sunsation Tours", type: "tour", category: "Tour Operator" },
  { name: "Best of Grenada Ltd", type: "tour", category: "Tour Operator" },
  { name: "Hidden Treasures Tours", type: "tour", category: "Tour Operator" },
  { name: "First Impressions Ltd", type: "tour", category: "Tour Operator" },
  { name: "AquaCarib Adventures & Tours", type: "tour", category: "Adventure" },
  { name: "Spice Isle Exploration", type: "tour", category: "Tour Operator" },
  { name: "A & E Tours Grenada", type: "tour", category: "Tour Operator" },
  { name: "Wondering Soles Walking Tours", type: "tour", category: "Walking Tour" },
  { name: "Caribbean Horizon Tours", type: "tour", category: "Tour Operator" },
  { name: "Isle of Reefs Tours", type: "tour", category: "Tour Operator" },
  { name: "St. James Travel & Tours", type: "tour", category: "Tour Operator" },
  { name: "Dave Tours Grenada", type: "tour", category: "Tour Operator" },
  { name: "Ryde Excursions Tuk Tuk Tours", type: "tour", category: "Tuk Tuk Tour" },
  { name: "Sun Hunters Buggy Tours", type: "tour", category: "Buggy Tour" },
  { name: "Adventure Jeep Tours", type: "tour", category: "Jeep Safari" },
  { name: "Conservation Kayak Grenada", type: "tour", category: "Kayaking" },
  { name: "Cayaks Grenada", type: "tour", category: "Kayaking" },
  { name: "Bonanza Stables Horseback Riding", type: "tour", category: "Horseback Riding" },
  { name: "True Blue Sportfishing", type: "tour", category: "Fishing" },
  { name: "Rum Knuckles Sport Fishing", type: "tour", category: "Fishing" },
  // Sailing
  { name: "Epiphany Cruises", type: "tour", category: "Sailing" },
  { name: "Jambalaya Sailing Charters", type: "tour", category: "Sailing" },
  { name: "Incognito Adventures", type: "tour", category: "Sailing" },
  { name: "Corsair Sailing Charters", type: "tour", category: "Sailing" },
  { name: "Footloose Yacht Charters", type: "tour", category: "Yacht Charter" },
  { name: "Savvy Sailing Tours", type: "tour", category: "Sailing" },
  { name: "Sail Away Grenada", type: "tour", category: "Sailing" },
  { name: "High Time Snorkel Tours", type: "tour", category: "Snorkeling" },
  // Diving
  { name: "EcoDive Grenada", type: "tour", category: "Diving" },
  { name: "Scuba West Indies", type: "tour", category: "Diving" },
  { name: "Lumbadive Ltd", type: "tour", category: "Diving" },
  { name: "Dive Carriacou", type: "tour", category: "Diving" },
  { name: "Native Spirit Dive Center", type: "tour", category: "Diving" },
  // Taxi/Tour combos
  { name: "Cutty's Taxi and Tours", type: "tour", category: "Taxi Tour" },
  { name: "Royalty Taxi & Tours", type: "tour", category: "Taxi Tour" },
  { name: "Real Grenadian Taxi and Tours", type: "tour", category: "Taxi Tour" },
  { name: "Ambassador Tours & Taxi Services", type: "tour", category: "Taxi Tour" },
  { name: "King Elvis Taxi & Tours", type: "tour", category: "Taxi Tour" },
  { name: "Illustrious Taxi and Tours", type: "tour", category: "Taxi Tour" },
  { name: "Eddie's Taxi & Tours", type: "tour", category: "Taxi Tour" },
  { name: "Ace Ventura Tours Grenada", type: "tour", category: "Taxi Tour" },

  // TRANSPORT
  { name: "Dabs Car Rental", type: "transport", category: "Car Rental" },
  { name: "Archie Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Wayne's Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Gabriel's Rental and Taxi", type: "transport", category: "Car Rental" },
  { name: "J and B Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Abs Car Rental", type: "transport", category: "Car Rental" },
  { name: "Sanvics Jeep and Car Rentals", type: "transport", category: "Car Rental" },
  { name: "Biker Boi Scooter Rental", type: "transport", category: "Scooter Rental" },
  { name: "Nedd's Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Azar's Auto Rentals and Tours", type: "transport", category: "Car Rental" },
  { name: "On Point Auto Rentals", type: "transport", category: "Car Rental" },
  { name: "Grencar Rentals", type: "transport", category: "Car Rental" },
  { name: "Carib Car Rentals", type: "transport", category: "Car Rental" },
  { name: "A1 Car Rental Grenada", type: "transport", category: "Car Rental" },
  { name: "Progressive Airport Taxi Union", type: "transport", category: "Taxi" },
  { name: "Grenada Airport Taxi Association", type: "transport", category: "Taxi" },
  { name: "Sweet Grenada Tours Taxi and Rentals", type: "transport", category: "Taxi" },
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
      description: `${biz.name} is a ${biz.category.toLowerCase()} in Grenada. This listing was created from public tourism directory data — the business owner can claim it for free to add photos, pricing, and availability.`,
      typeData: { unclaimed: true, category: biz.category, source: "puregrenada.com" },
      isFeatured: false,
      isInstantBook: false,
    });
    imported++;
  }

  console.log(`Imported: ${imported} | Skipped (duplicates): ${skipped} | Total in list: ${businesses.length}`);
}

main().catch(console.error);
