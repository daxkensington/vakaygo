/**
 * Seed Excursion, Transfer, and VIP businesses from research
 * 59 real businesses across 8 Caribbean islands
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, listings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
function slugify(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 200); }

type Biz = { name: string; type: "excursion" | "transfer" | "vip"; island: string; description: string; category: string; website?: string; phone?: string };

const businesses: Biz[] = [
  // GRENADA TRANSFERS
  { name: "Grenada Taxi and Airport Transfers", type: "transfer", island: "grenada", description: "Dedicated airport pickup/dropoff service at Maurice Bishop International Airport. Professional drivers, fixed pricing, AC vehicles to any hotel on the island.", category: "Airport Transfer", website: "grenadataxiandairporttransfers.com" },
  { name: "Spice Chauffeur", type: "transfer", island: "grenada", description: "Professional luxury chauffeur service with fixed-rate transfers from Maurice Bishop International Airport. Airport to Grand Anse hotels from $16. Premium vehicles available.", category: "Luxury Transfer", website: "spicechauffeur.com" },
  { name: "Island Taxi & Tours GND FastTrack", type: "transfer", island: "grenada", description: "Airport transfers plus FastTrack VIP arrival service at Maurice Bishop International Airport. Skip the lines, meet & greet at arrivals.", category: "Airport Transfer + VIP", website: "islandtaxignd.com" },

  // GRENADA EXCURSIONS
  { name: "Tours Grenada Yacht Excursions", type: "excursion", island: "grenada", description: "Licensed operator with 73-ft classic yacht. Sunset champagne cruises, snorkeling/diving, deep-sea fishing, whale watching, and weekend trips to Tobago Cays for turtle snorkeling.", category: "Yacht Excursion", website: "toursgrenada.com", phone: "+1 473 415-8665" },
  { name: "High Time Catamaran Snorkel Excursion", type: "excursion", island: "grenada", description: "52-foot catamaran coastal cruises including snorkeling at the famous Underwater Sculpture Park. Red Cross and PADI trained crew, snorkel gear and bar on board. 34+ years experience.", category: "Catamaran Excursion" },
  { name: "Carib Cats Grenada", type: "excursion", island: "grenada", description: "Catamaran tours on Grenada's west coast. Half-day sail & snorkel, full day with lunch, sunset cruises — all with open bar. Beautiful sailing excursions.", category: "Catamaran Excursion" },
  { name: "Grenadines Sailing Escapade", type: "excursion", island: "grenada", description: "Catamaran charter adventures from half-day trips to month-long cruises around Grenada and the Grenadines. Island hopping to Carriacou and Petite Martinique.", category: "Sailing Excursion", website: "grenadinessailingescapade.com" },
  { name: "Island Routes Grenada Excursions", type: "excursion", island: "grenada", description: "River tubing, waterfall chasing at Annandale, Concord, and Seven Sisters Falls. Grand Etang Rainforest hikes, deep sea fishing, Carriacou adventure cruises, and kayaking.", category: "Adventure Excursion", website: "islandroutes.com" },
  { name: "Funtastic Island Adventures Grenada", type: "excursion", island: "grenada", description: "Ocean to Falls — Discover It All! Locally owned offering water-based and land-based adventures. Build your own custom tour. Full-day adventure excursions.", category: "Adventure Excursion", website: "gofuntastictours.com", phone: "(473) 535-2180" },
  { name: "Grenada ATV Adventures", type: "excursion", island: "grenada", description: "ATV tours exploring Grenada's coastline with panoramic ocean views, beaches, and lookout points. Coastal trail tours on the southern and eastern sides. Includes safety briefing, equipment, and hotel transport.", category: "ATV Excursion", website: "grenadaatv.com", phone: "+1 473-456-6313" },

  // GRENADA VIP
  { name: "Grenada Fast Track VIP", type: "vip", island: "grenada", description: "VIP arrival/departure at Maurice Bishop Airport. Agents meet you before Immigration with name signage, escort through dedicated counters, VIP Suite access with complimentary refreshments.", category: "Airport VIP", website: "grenadafasttrack.com" },
  { name: "IAM Jet Centre Grenada", type: "vip", island: "grenada", description: "FBO at Maurice Bishop Airport since 1989. St. George's Suite VIP service for BA, Virgin Atlantic, American Airlines passengers. Private Customs/Immigration, lounge, spa showers, luxury golf cart transport.", category: "Private Aviation VIP", website: "iamjetcentre.com", phone: "+473-439-9731" },
  { name: "Royal Airport Concierge Grenada", type: "vip", island: "grenada", description: "VIP meet and greet at Maurice Bishop Airport. Greeter meets at aircraft, assists through passport/visa, porter service, VIP lounge access. Arrivals, departures, and transit.", category: "Airport Concierge", website: "royalairportconcierge.com" },

  // JAMAICA TRANSFERS
  { name: "Jamaica Tours Ltd", type: "transfer", island: "jamaica", description: "Largest fleet of AC cars and coaches in Jamaica. Representatives meet guests at Donald Sangster International Airport in Montego Bay.", category: "Airport Transfer", website: "jamaicatoursltd.com" },
  { name: "Best Jamaica Tours Airport Transfer", type: "transfer", island: "jamaica", description: "Official Montego Bay Airport transportation partner at Desk 4 inside MBJ arrivals hall. Locally owned since 2013. Routes to Montego Bay, Negril, Ocho Rios.", category: "Airport Transfer", website: "bestjamaicatours.com" },
  { name: "Reggae Tours Jamaica Transfer", type: "transfer", island: "jamaica", description: "Private Montego Bay airport transfers from Sangster International Airport. Serving travelers since 2008. Reliable, comfortable, AC vehicles.", category: "Airport Transfer", website: "reggaetoursjamaica.com" },
  { name: "Groovy Tours Jamaica", type: "transfer", island: "jamaica", description: "Ground transportation from Sangster International Airport (MBJ) to all major resorts, hotels, villas, and cruise destinations across Jamaica.", category: "Airport Transfer", website: "groovytoursjamaica.com" },
  { name: "Jamaica Transfers Online", type: "transfer", island: "jamaica", description: "Exclusive private airport transfers, group transportation, and tours across 20+ destinations. 24/7 service from both Montego Bay and Kingston airports.", category: "Airport Transfer", website: "jamaicatransfersonlines.com" },

  // JAMAICA VIP
  { name: "SkyPass Caribbean Jamaica", type: "vip", island: "jamaica", description: "Airport fast track and VIP concierge at Montego Bay and Kingston airports. Arrival from $75/person, roundtrip from $150. Agents expedite lines and handle paperwork.", category: "Airport VIP", website: "skypasscaribbean.com" },
  { name: "APSIL Security Services Jamaica", type: "vip", island: "jamaica", description: "Licensed bodyguard and executive protection company providing exclusive personalized security to VIPs, celebrities, tourists, and high-net-worth individuals.", category: "Executive Protection", website: "apsilsecurityservices.com" },
  { name: "Black Mountain Solutions Jamaica", type: "vip", island: "jamaica", description: "VIP and executive protection, ground transportation, and travel advisory services in Jamaica. Professional security for high-profile travelers.", category: "Security & Protection", website: "blackmountain-solutions.com" },

  // BARBADOS TRANSFERS
  { name: "SunTours Barbados", type: "transfer", island: "barbados", description: "Leading transport company with 160 years in business. Meet and greet dispatchers at Grantley Adams Airport for smooth transitions. Shuttle services and island tours.", category: "Airport Transfer", website: "suntoursbarbados.com" },
  { name: "Barbados Taxi Service Airport Transfer", type: "transfer", island: "barbados", description: "One of the best transportation providers on the island with a local team of professionals for airport transfers from Grantley Adams Airport.", category: "Airport Transfer", website: "barbadostaxiservice.com" },

  // ST. LUCIA TRANSFERS
  { name: "St Lucia Airport Shuttle", type: "transfer", island: "st-lucia", description: "Industry leader in airport shuttle business with thousands of reviews. Drivers wait at customs with name signs. Service from Hewanorra International Airport.", category: "Airport Shuttle", website: "saintluciaairportshuttle.com" },
  { name: "Hilary Transfers and Tours St Lucia", type: "transfer", island: "st-lucia", description: "Professional, safe, and comfortable transportation with experienced drivers from Hewanorra International Airport to any destination on island.", category: "Airport Transfer", website: "hilarytransfersandtours.com" },
  { name: "St. Lucia Helicopters Transfer", type: "transfer", island: "st-lucia", description: "Helicopter transfers from Hewanorra International Airport — a scenic VIP alternative to road transfers. See the Pitons from above.", category: "Helicopter Transfer", website: "stluciahelicopters.com" },
  { name: "Lucian Vibe VIP Transfer", type: "transfer", island: "st-lucia", description: "Airport transfer service with luxury add-ons including fast track processing, wine/champagne, and flowers. Premium Caribbean arrival experience.", category: "VIP Transfer", website: "lucianvibe.com" },

  // BAHAMAS TRANSFERS
  { name: "Airport Transfers Nassau", type: "transfer", island: "bahamas", description: "Established since 2003, one of the premier transportation and chauffeur companies on New Providence island. Professional Nassau airport service.", category: "Airport Transfer", website: "airporttransfernassau.com" },
  { name: "Simon's Transports Bahamas", type: "transfer", island: "bahamas", description: "Over 3 decades of experience in Bahamas airport transportation across Nassau, Exuma, Abaco, Freeport, and Eleuthera islands.", category: "Airport Transfer", website: "simonstransportsbahamas.com" },
  { name: "Black Diamond Transportation Bahamas", type: "transfer", island: "bahamas", description: "Luxury transportation with VIP Fast Track service in Nassau. Smooth, hassle-free transfers with premium vehicles.", category: "VIP Transfer", website: "bdtbahamas.com" },

  // TRINIDAD TRANSFERS
  { name: "KIAK Transportation Services Trinidad", type: "transfer", island: "trinidad-and-tobago", description: "Authorized Piarco International Airport taxi service operator providing door-to-door transfers. Professional, reliable airport service.", category: "Airport Transfer", website: "kiaktransportationservices.com" },

  // ARUBA TRANSFERS
  { name: "Go Local Aruba Airport Transfers", type: "transfer", island: "aruba", description: "Established 10+ years in ground transportation. Professional car service transfers to/from Queen Beatrix International Airport and Aruba cruise port.", category: "Airport Transfer", website: "golocalaruba.com" },
  { name: "Fofoti Tours & Transfers Aruba", type: "transfer", island: "aruba", description: "Operating 15+ years. Airport transfers, UTV adventures, scenic bus tours. Revolutionizing quality standards for tours and transfers on Aruba.", category: "Airport Transfer + Tours", website: "fofoti.com" },
  { name: "First Class Experience Aruba", type: "transfer", island: "aruba", description: "Luxury private transport and VIP airport transfer services. Premium vehicles, professional chauffeurs, first-class Caribbean arrival.", category: "VIP Transfer", website: "firstclassexperience.com" },

  // MULTI-ISLAND VIP
  { name: "Infinite Risks International Caribbean", type: "vip", island: "grenada", description: "Licensed bodyguards and security officers with advanced training in security driving, first response emergency care, and surveillance detection. Executive protection across Caribbean islands.", category: "Executive Protection", website: "infiniterisks.com" },
  { name: "Island VIP Concierge Caribbean", type: "vip", island: "grenada", description: "Bespoke travel experiences with personalized travel planning, VIP assistance, exclusive butler services, and 24/7 support across the Caribbean.", category: "VIP Concierge", website: "islandvipconcierge.com" },

  // ANTIGUA VIP
  { name: "VC Bird Airport VIP Services Antigua", type: "vip", island: "antigua", description: "Exclusive meet and greet service with full escort through airport formalities and priority transfer through arrival concourse to ground transportation.", category: "Airport VIP", website: "vcbia.com" },

  // TURKS & CAICOS VIP
  { name: "VIP Flyers Lounge Turks and Caicos", type: "vip", island: "turks-and-caicos", description: "VIP meet and greet at Providenciales Airport with fast track through Immigration and Customs, or departing with expedited check-ins and security.", category: "Airport VIP", website: "vipflyerslounge.com" },
];

async function main() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  let [op] = await db.select({ id: users.id }).from(users).where(eq(users.email, "unclaimed@vakaygo.com")).limit(1);
  if (!op) {
    [op] = await db.insert(users).values({ email: "unclaimed@vakaygo.com", name: "Unclaimed Listing", role: "operator", businessName: "Unclaimed" }).returning({ id: users.id });
  }

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
      headline: `${biz.category} in the Caribbean`,
      description: biz.description,
      typeData: { unclaimed: true, category: biz.category, website: biz.website || null, phone: biz.phone || null, source: "research" },
      isFeatured: biz.type === "vip",
      isInstantBook: biz.type === "transfer",
    });
    imported++;
    console.log(`✓ ${biz.name} (${biz.type})`);
  }

  console.log(`\nImported: ${imported} | Skipped: ${skipped} | Total: ${businesses.length}`);
}

main().catch(console.error);
