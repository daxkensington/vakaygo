/**
 * Extended Grenada Seed Script
 * Seeds real Grenada businesses from public knowledge as unclaimed listings.
 * Business owners can claim these for free.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200);
}

const grenadaBusinesses = [
  // STAYS
  { name: "Spice Island Beach Resort", type: "stay", parish: "St. George", description: "Award-winning luxury resort on Grand Anse Beach with all-inclusive packages, beachfront suites, and a world-class spa.", category: "Resort" },
  { name: "Radisson Grenada Beach Resort", type: "stay", parish: "St. George", description: "Full-service resort on Grand Anse Beach with multiple restaurants, pools, and water sports facilities.", category: "Resort" },
  { name: "Coyaba Beach Resort", type: "stay", parish: "St. George", description: "Boutique resort on Grand Anse Beach known for personal service, tropical gardens, and oceanfront dining.", category: "Resort" },
  { name: "True Blue Bay Boutique Resort", type: "stay", parish: "St. George", description: "Family-friendly waterfront resort in True Blue Bay with apartments, pool villas, and on-site restaurants.", category: "Resort" },
  { name: "Laluna Resort", type: "stay", parish: "St. George", description: "Luxury Italian-Caribbean boutique hotel with private cottages, yoga pavilion, and beachfront dining.", category: "Boutique Hotel" },
  { name: "Mount Cinnamon Resort", type: "stay", parish: "St. George", description: "Hillside boutique resort overlooking Grand Anse Beach with private plunge pools and nature trails.", category: "Boutique Hotel" },
  { name: "Petite Anse Hotel", type: "stay", parish: "St. Patrick", description: "Charming family-run hotel on a secluded beach in northern Grenada with stunning views of the Grenadines.", category: "Hotel" },
  { name: "Maca Bana Luxury Boutique Villa Resort", type: "stay", parish: "St. George", description: "Exclusive villa resort on a hillside with panoramic ocean views, private pools, and personalized service.", category: "Villa" },
  { name: "Calabash Luxury Boutique Hotel", type: "stay", parish: "St. George", description: "Elegant 5-star boutique hotel in L'Anse Aux Epines with award-winning dining and a private beach.", category: "Boutique Hotel" },
  { name: "SandCastle on the Beach", type: "stay", parish: "Carriacou", description: "Beachfront boutique hotel on Carriacou's Hillsborough Bay with a restaurant and dive center.", category: "Hotel" },

  // TOURS & EXCURSIONS
  { name: "Grenada Seafaris", type: "tour", parish: "St. George", description: "High-speed powerboat tours along Grenada's coastline with snorkeling stops at hidden bays and coral reefs.", category: "Boat Tour" },
  { name: "Savvy Tours Grenada", type: "tour", parish: "St. George", description: "Island tours covering waterfalls, spice plantations, rum distilleries, and historical sites with local guides.", category: "Island Tour" },
  { name: "Mandoo Tours", type: "tour", parish: "St. George", description: "Popular island tour operator offering customized sightseeing, hiking, and cultural tours across Grenada.", category: "Island Tour" },
  { name: "Henry's Safari Tours", type: "tour", parish: "St. George", description: "Off-road jeep safari tours through Grenada's rainforest, plantations, and scenic mountain roads.", category: "Adventure Tour" },
  { name: "Aquanauts Grenada", type: "tour", parish: "St. George", description: "PADI dive center offering scuba diving, snorkeling, and underwater sculpture park tours in Moliniere Bay.", category: "Diving" },
  { name: "Dive Grenada", type: "tour", parish: "St. George", description: "Professional dive center in Grand Anse offering reef dives, wreck dives, and the underwater sculpture park.", category: "Diving" },
  { name: "Shadowfax Catamaran", type: "tour", parish: "St. George", description: "Luxury catamaran sailing tours with sunset cruises, snorkeling, and rum punch along Grenada's west coast.", category: "Sailing" },
  { name: "Island Routes Grenada", type: "tour", parish: "St. George", description: "Adventure excursions including river tubing, ATV tours, rainforest hiking, and catamaran cruises.", category: "Adventure Tour" },
  { name: "Grenada Chocolate Company", type: "tour", parish: "St. Patrick", description: "Bean-to-bar organic chocolate factory tour in northern Grenada. See the full chocolate-making process.", category: "Food Tour" },
  { name: "River Antoine Rum Distillery", type: "tour", parish: "St. Patrick", description: "The oldest functioning water-propelled distillery in the Caribbean. Tour the rum-making process from cane to bottle.", category: "Distillery Tour" },
  { name: "Belmont Estate", type: "tour", parish: "St. Patrick", description: "Historic plantation offering chocolate-making tours, organic farm visits, and traditional Grenadian lunch.", category: "Plantation Tour" },
  { name: "Grand Etang National Park", type: "tour", parish: "St. Andrew", description: "Grenada's premier nature attraction with crater lake, rainforest trails, waterfalls, and Mona monkey sightings.", category: "Nature" },

  // DINING
  { name: "The Aquarium Restaurant", type: "dining", parish: "St. George", description: "Beachfront dining at Magazine Beach with fresh seafood, Caribbean fusion, and sunset views.", category: "Seafood" },
  { name: "Umbrellas Beach Bar", type: "dining", parish: "St. George", description: "Iconic beach bar on Grand Anse serving cocktails, burgers, and grilled seafood with your feet in the sand.", category: "Beach Bar" },
  { name: "Patrick's Local Homestyle Cooking", type: "dining", parish: "St. George", description: "Beloved local restaurant serving traditional Grenadian dishes including Oil Down, callaloo soup, and lambie.", category: "Local Cuisine" },
  { name: "Sails Restaurant & Bar", type: "dining", parish: "St. George", description: "Waterfront fine dining at Secret Harbour with contemporary Caribbean cuisine and craft cocktails.", category: "Fine Dining" },
  { name: "La Luna Restaurant", type: "dining", parish: "St. George", description: "Romantic Italian-Caribbean restaurant at Laluna Resort with beachfront seating and candlelit dinners.", category: "Fine Dining" },
  { name: "Coconut Beach Restaurant", type: "dining", parish: "St. George", description: "Casual beachfront restaurant on Grand Anse serving grilled fish, lobster, and local dishes.", category: "Seafood" },
  { name: "Carib Sushi", type: "dining", parish: "St. George", description: "Japanese-Caribbean fusion sushi bar in True Blue. Fresh fish with a Caribbean twist.", category: "Fusion" },
  { name: "Westerhall Estate Rum Distillery Bar", type: "dining", parish: "St. David", description: "Rum tasting and cocktail bar at the historic Westerhall Estate with panoramic views.", category: "Bar" },
  { name: "De Big Fish", type: "dining", parish: "St. George", description: "Popular seafood restaurant in True Blue Marina with fresh catch of the day and waterfront dining.", category: "Seafood" },
  { name: "Rhodes Restaurant", type: "dining", parish: "St. George", description: "Upscale Caribbean restaurant at Calabash Hotel, formerly by celebrity chef Gary Rhodes.", category: "Fine Dining" },

  // EVENTS
  { name: "Grenada Spicemas Carnival", type: "event", parish: "St. George", description: "Grenada's biggest annual celebration featuring J'Ouvert, Monday Night Mas, and Parade of the Bands. Soca, calypso, and Caribbean culture at its finest.", category: "Festival" },
  { name: "Grenada Sailing Festival", type: "event", parish: "St. George", description: "Annual sailing regatta in January/February bringing sailors from across the Caribbean and beyond.", category: "Sports" },
  { name: "Pure Grenada Music Festival", type: "event", parish: "St. George", description: "International music festival featuring reggae, soca, R&B, and jazz artists on the beach.", category: "Music Festival" },
  { name: "Grenada Chocolate Festival", type: "event", parish: "St. George", description: "Annual celebration of Grenada's organic chocolate heritage with tastings, workshops, and farm tours.", category: "Food Festival" },
  { name: "Carriacou Carnival", type: "event", parish: "Carriacou", description: "Traditional carnival on Carriacou island featuring Shakespeare Mas, Pierrot Grenade, and local calypso.", category: "Festival" },

  // TRANSPORT
  { name: "Grenada Water Taxi", type: "transport", parish: "St. George", description: "Water taxi service around St. George's harbour and between beaches. A scenic alternative to road transport.", category: "Water Taxi" },
  { name: "Osprey Lines Ferry", type: "transport", parish: "St. George", description: "Ferry service connecting Grenada to Carriacou and Petite Martinique. Multiple daily departures.", category: "Ferry" },
  { name: "McIntyre Bros Car Rental", type: "transport", parish: "St. George", description: "Established car rental company near the airport with a range of vehicles from economy to SUVs.", category: "Car Rental" },
  { name: "Y&R Car Rentals", type: "transport", parish: "St. George", description: "Reliable car rental service in Grenada with free airport pickup and drop-off.", category: "Car Rental" },

  // GUIDES
  { name: "Telfor Bedeau — Hiking Legend", type: "guide", parish: "St. Andrew", description: "Grenada's most famous hiking guide. Telfor has been leading hikers through the island's trails for over 50 years. An authentic Grenadian treasure.", category: "Hiking Guide" },
];

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  const [grenada] = await db.select({ id: islands.id }).from(islands).where(eq(islands.slug, "grenada")).limit(1);
  if (!grenada) { console.error("Run seed.ts first"); process.exit(1); }

  let [operator] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!operator) {
    [operator] = await db.insert(users).values({
      email: "unclaimed@vakaygo.com", name: "Unclaimed Listing", role: "operator",
      businessName: "Unclaimed — Claim Your Business", islandId: grenada.id,
    }).returning({ id: users.id });
  }

  let imported = 0;
  for (const biz of grenadaBusinesses) {
    const slug = slugify(biz.name);
    const existing = await db.select({ id: listings.id }).from(listings).where(eq(listings.slug, slug)).limit(1);
    if (existing.length > 0) { console.log(`  Skip: ${biz.name} (exists)`); continue; }

    await db.insert(listings).values({
      operatorId: operator.id,
      islandId: grenada.id,
      type: biz.type as "stay" | "tour" | "dining" | "event" | "transport" | "guide",
      status: "active",
      title: biz.name,
      slug,
      headline: `Discover ${biz.name} in Grenada`,
      description: biz.description,
      parish: biz.parish,
      typeData: { unclaimed: true, category: biz.category, source: "public-knowledge" },
      isFeatured: false,
      isInstantBook: false,
    });
    imported++;
    console.log(`✓ ${biz.name} (${biz.type})`);
  }

  console.log(`\nImported ${imported} Grenada businesses`);
}

main().catch(console.error);
