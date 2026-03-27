import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { islands, categories, listings, media, users } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL!;

async function seed() {
  const sql = neon(DATABASE_URL);
  const db = drizzle(sql);

  console.log("Seeding database...");

  // 1. Seed Grenada
  const [grenada] = await db
    .insert(islands)
    .values({
      slug: "grenada",
      name: "Grenada",
      country: "Grenada",
      region: "Caribbean",
      description: "Known as the Isle of Spice, Grenada is a tri-island state featuring pristine beaches, lush rainforests, and the world's first underwater sculpture park.",
      latitude: "12.1165",
      longitude: "-61.6790",
      timezone: "America/Grenada",
      currency: "XCD",
      isActive: true,
      sortOrder: 1,
    })
    .onConflictDoNothing({ target: islands.slug })
    .returning({ id: islands.id });

  const islandId = grenada?.id || 1;
  console.log("Island seeded:", islandId);

  // 2. Seed categories
  const cats = [
    { slug: "villa", name: "Villa", listingType: "stay" as const, icon: "home", sortOrder: 1 },
    { slug: "guesthouse", name: "Guesthouse", listingType: "stay" as const, icon: "home", sortOrder: 2 },
    { slug: "hotel", name: "Hotel", listingType: "stay" as const, icon: "home", sortOrder: 3 },
    { slug: "sailing", name: "Sailing", listingType: "tour" as const, icon: "compass", sortOrder: 1 },
    { slug: "diving", name: "Diving & Snorkeling", listingType: "tour" as const, icon: "compass", sortOrder: 2 },
    { slug: "hiking", name: "Hiking", listingType: "tour" as const, icon: "compass", sortOrder: 3 },
    { slug: "cultural", name: "Cultural", listingType: "tour" as const, icon: "compass", sortOrder: 4 },
    { slug: "local-cuisine", name: "Local Cuisine", listingType: "dining" as const, icon: "utensils", sortOrder: 1 },
    { slug: "fine-dining", name: "Fine Dining", listingType: "dining" as const, icon: "utensils", sortOrder: 2 },
    { slug: "beach-bar", name: "Beach Bar", listingType: "dining" as const, icon: "utensils", sortOrder: 3 },
    { slug: "fete", name: "Fete", listingType: "event" as const, icon: "music", sortOrder: 1 },
    { slug: "festival", name: "Festival", listingType: "event" as const, icon: "music", sortOrder: 2 },
    { slug: "airport-transfer", name: "Airport Transfer", listingType: "transport" as const, icon: "car", sortOrder: 1 },
    { slug: "island-tour", name: "Island Tour", listingType: "transport" as const, icon: "car", sortOrder: 2 },
    { slug: "food-guide", name: "Food Guide", listingType: "guide" as const, icon: "users", sortOrder: 1 },
    { slug: "adventure-guide", name: "Adventure Guide", listingType: "guide" as const, icon: "users", sortOrder: 2 },
  ];

  await db.insert(categories).values(cats).onConflictDoNothing({ target: categories.slug });
  console.log("Categories seeded");

  // 3. Create demo operator
  const [operator] = await db
    .insert(users)
    .values({
      email: "demo@vakaygo.com",
      name: "VakayGo Demo",
      role: "operator",
      businessName: "VakayGo Demo Listings",
      islandId,
      onboardingComplete: true,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  const operatorId = operator?.id;
  if (!operatorId) {
    console.log("Demo operator already exists, skipping listings");
    return;
  }

  // 4. Seed listings
  const seedListings = [
    // STAYS
    {
      type: "stay" as const,
      title: "Beachfront Villa at Grand Anse",
      slug: "beachfront-villa-grand-anse",
      headline: "Wake up to ocean views from the best beach in the Caribbean",
      description: "A stunning 3-bedroom villa directly on Grand Anse Beach with private pool, modern kitchen, and wraparound terrace. Perfect for families and groups looking for the ultimate Grenada stay.",
      parish: "St. George",
      priceAmount: "275.00",
      priceUnit: "night",
      avgRating: "4.92",
      reviewCount: 47,
      isFeatured: true,
      isInstantBook: true,
      typeData: { bedrooms: 3, bathrooms: 2, maxGuests: 6, amenities: ["WiFi", "Pool", "Kitchen", "AC", "Beach Access", "Parking"] },
      image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80&auto=format",
    },
    {
      type: "stay" as const,
      title: "Rainforest Eco Lodge",
      slug: "rainforest-eco-lodge",
      headline: "Immerse yourself in nature at Grand Etang",
      description: "An eco-friendly treehouse lodge nestled in the rainforest near Grand Etang National Park. Wake up to birdsong and hike to waterfalls from your doorstep.",
      parish: "St. Andrew",
      priceAmount: "145.00",
      priceUnit: "night",
      avgRating: "4.85",
      reviewCount: 31,
      isFeatured: false,
      isInstantBook: true,
      typeData: { bedrooms: 1, bathrooms: 1, maxGuests: 2, amenities: ["WiFi", "Nature Trails", "Breakfast Included", "Eco-Friendly"] },
      image: "https://images.unsplash.com/photo-1602002418816-5c0aeef426aa?w=800&q=80&auto=format",
    },
    {
      type: "stay" as const,
      title: "Spice Island Boutique Hotel",
      slug: "spice-island-boutique-hotel",
      headline: "Luxury meets Caribbean charm in St. George's",
      description: "A 12-room boutique hotel in the heart of the capital with rooftop bar overlooking the harbour. Each room features local art and handcrafted furniture.",
      parish: "St. George",
      priceAmount: "195.00",
      priceUnit: "night",
      avgRating: "4.78",
      reviewCount: 89,
      isFeatured: true,
      isInstantBook: true,
      typeData: { bedrooms: 1, bathrooms: 1, maxGuests: 2, amenities: ["WiFi", "AC", "Rooftop Bar", "Restaurant", "Harbour View"] },
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format",
    },
    {
      type: "stay" as const,
      title: "Carriacou Beach Cottage",
      slug: "carriacou-beach-cottage",
      headline: "Your own private paradise on Carriacou",
      description: "A charming beachfront cottage on the sister isle of Carriacou. Steps from the sand with a hammock, outdoor shower, and the most peaceful sunsets.",
      parish: "Carriacou",
      priceAmount: "120.00",
      priceUnit: "night",
      avgRating: "4.95",
      reviewCount: 22,
      isFeatured: false,
      isInstantBook: false,
      typeData: { bedrooms: 2, bathrooms: 1, maxGuests: 4, amenities: ["Beach Access", "Hammock", "Kitchen", "Snorkeling Gear"] },
      image: "https://images.unsplash.com/photo-1499793983394-e58fc3c5ecb2?w=800&q=80&auto=format",
    },
    // TOURS
    {
      type: "tour" as const,
      title: "Sunset Sailing & Snorkeling Adventure",
      slug: "sunset-sailing-snorkeling",
      headline: "Sail the Caribbean Sea as the sun paints the sky",
      description: "A 4-hour catamaran cruise along Grenada's west coast with stops for snorkeling at pristine reefs. Includes rum punch, local snacks, and the best sunset views on the island.",
      parish: "St. George",
      priceAmount: "85.00",
      priceUnit: "person",
      avgRating: "4.95",
      reviewCount: 156,
      isFeatured: true,
      isInstantBook: true,
      typeData: { duration: "4 hours", maxGroupSize: 20, difficulty: "Easy", includes: ["Rum Punch", "Snacks", "Snorkel Gear", "Towels"], meetingPoint: "Grand Anse Beach Jetty" },
      image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80&auto=format",
    },
    {
      type: "tour" as const,
      title: "Underwater Sculpture Park Dive",
      slug: "underwater-sculpture-park-dive",
      headline: "Dive into the world's first underwater sculpture park",
      description: "Explore Moliniere Bay's famous underwater sculptures with a certified PADI instructor. Suitable for beginners and experienced divers. Equipment included.",
      parish: "St. George",
      priceAmount: "95.00",
      priceUnit: "person",
      avgRating: "4.92",
      reviewCount: 78,
      isFeatured: true,
      isInstantBook: true,
      typeData: { duration: "3 hours", maxGroupSize: 8, difficulty: "Moderate", includes: ["All Equipment", "Instructor", "Photos", "Transport to Site"] },
      image: "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800&q=80&auto=format",
    },
    {
      type: "tour" as const,
      title: "Spice Farm & Waterfall Hike",
      slug: "spice-farm-waterfall-hike",
      headline: "Taste the spices and chase the waterfalls",
      description: "Visit a working nutmeg and cocoa plantation, learn about Grenada's spice heritage, then hike through the rainforest to Annandale Falls for a swim.",
      parish: "St. Andrew",
      priceAmount: "65.00",
      priceUnit: "person",
      avgRating: "4.88",
      reviewCount: 94,
      isFeatured: false,
      isInstantBook: true,
      typeData: { duration: "5 hours", maxGroupSize: 12, difficulty: "Moderate", includes: ["Transport", "Guide", "Spice Samples", "Lunch"] },
      image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80&auto=format",
    },
    // DINING
    {
      type: "dining" as const,
      title: "BB's Crabback Restaurant",
      slug: "bbs-crabback",
      headline: "Where the locals eat — the best crab back in Grenada",
      description: "A legendary waterfront restaurant famous for its crab back, fresh grilled lobster, and Oil Down. Family-owned for 30 years with the best harbour views in St. George's.",
      parish: "St. George",
      priceAmount: "35.00",
      priceUnit: "avg meal",
      avgRating: "4.72",
      reviewCount: 234,
      isFeatured: true,
      isInstantBook: true,
      typeData: { cuisineType: "Caribbean", mealTypes: ["Lunch", "Dinner"], priceRange: "$$", hours: "11am - 10pm" },
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format",
    },
    {
      type: "dining" as const,
      title: "The Beach House Restaurant",
      slug: "beach-house-restaurant",
      headline: "Fine Caribbean dining with your toes in the sand",
      description: "An upscale beachfront restaurant on Grand Anse serving contemporary Caribbean cuisine. Fresh catch of the day, craft cocktails, and live music on weekends.",
      parish: "St. George",
      priceAmount: "55.00",
      priceUnit: "avg meal",
      avgRating: "4.65",
      reviewCount: 167,
      isFeatured: false,
      isInstantBook: true,
      typeData: { cuisineType: "Contemporary Caribbean", mealTypes: ["Lunch", "Dinner"], priceRange: "$$$", hours: "12pm - 11pm" },
      image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80&auto=format",
    },
    {
      type: "dining" as const,
      title: "Dodgy Dock Bar & Restaurant",
      slug: "dodgy-dock",
      headline: "The most fun you'll have eating in Grenada",
      description: "A laid-back waterfront bar and grill in True Blue Bay. Known for their fish tacos, rum cocktails, and pizza nights. Live music every Friday.",
      parish: "St. George",
      priceAmount: "22.00",
      priceUnit: "avg meal",
      avgRating: "4.58",
      reviewCount: 312,
      isFeatured: true,
      isInstantBook: true,
      typeData: { cuisineType: "Caribbean Fusion", mealTypes: ["Lunch", "Dinner", "Late Night"], priceRange: "$", hours: "10am - midnight" },
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80&auto=format",
    },
    // EVENTS
    {
      type: "event" as const,
      title: "Spicemas Carnival Friday Night Mas",
      slug: "spicemas-friday-night-mas",
      headline: "The biggest fete of the year — Grenada's Carnival",
      description: "Join thousands for Friday Night Mas, the electrifying opening of Grenada's Spicemas Carnival. Soca music, costumes, paint, and pure Caribbean energy.",
      parish: "St. George",
      priceAmount: "45.00",
      priceUnit: "ticket",
      avgRating: "4.90",
      reviewCount: 67,
      isFeatured: true,
      isInstantBook: true,
      typeData: { startDate: "2026-08-07", venue: "St. George's Carenage", capacity: 5000, ageRestriction: "18+" },
      image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80&auto=format",
    },
    {
      type: "event" as const,
      title: "Full Moon Beach Party",
      slug: "full-moon-beach-party",
      headline: "Dance under the stars on Grand Anse Beach",
      description: "Monthly full moon beach party with DJs, bonfires, and cocktails right on the sand. The ultimate Caribbean night out.",
      parish: "St. George",
      priceAmount: "20.00",
      priceUnit: "ticket",
      avgRating: "4.75",
      reviewCount: 43,
      isFeatured: false,
      isInstantBook: true,
      typeData: { startDate: "2026-04-12", venue: "Grand Anse Beach", capacity: 500, ageRestriction: "None" },
      image: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&q=80&auto=format",
    },
    // TRANSPORT
    {
      type: "transport" as const,
      title: "Airport to Grand Anse — Private Transfer",
      slug: "airport-grand-anse-transfer",
      headline: "Skip the taxi hassle — your driver is waiting",
      description: "Private airport transfer from Maurice Bishop International to Grand Anse Beach area. Your driver meets you at arrivals with a name sign. AC vehicle, flight tracking included.",
      parish: "St. George",
      priceAmount: "30.00",
      priceUnit: "trip",
      avgRating: "4.88",
      reviewCount: 203,
      isFeatured: true,
      isInstantBook: true,
      typeData: { vehicleType: "Sedan", capacity: 3, serviceArea: "Airport to Grand Anse", rateType: "fixed" },
      image: "https://images.unsplash.com/photo-1449965408869-ebd13bc9e5a8?w=800&q=80&auto=format",
    },
    {
      type: "transport" as const,
      title: "Full Island Tour — Private Driver",
      slug: "full-island-tour-driver",
      headline: "See all of Grenada with your own private driver",
      description: "Full-day private driver to see Grenada's highlights: Grand Etang, Annandale Falls, Fort George, Concord Falls, the Spice Basket, and more. Customizable route.",
      parish: "St. George",
      priceAmount: "150.00",
      priceUnit: "trip",
      avgRating: "4.93",
      reviewCount: 87,
      isFeatured: true,
      isInstantBook: true,
      typeData: { vehicleType: "SUV", capacity: 4, serviceArea: "Full Island", rateType: "daily" },
      image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80&auto=format",
    },
    // GUIDES
    {
      type: "guide" as const,
      title: "Chef Marcus — Private Food Tour",
      slug: "chef-marcus-food-tour",
      headline: "Eat where the locals eat with a real Grenadian chef",
      description: "Chef Marcus takes you to his favourite hidden food spots across St. George's. You'll try Oil Down, crab back, lambie, roti, and fresh cocoa tea. Not on any tourist map.",
      parish: "St. George",
      priceAmount: "120.00",
      priceUnit: "person",
      avgRating: "5.00",
      reviewCount: 34,
      isFeatured: true,
      isInstantBook: false,
      typeData: { languages: ["English", "Creole"], specialties: ["Food", "Culture", "History"], yearsExperience: 12 },
      image: "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=800&q=80&auto=format",
    },
    {
      type: "guide" as const,
      title: "Keisha — Rainforest & Waterfall Explorer",
      slug: "keisha-rainforest-explorer",
      headline: "Discover Grenada's hidden waterfalls with a nature expert",
      description: "Keisha grew up hiking these trails. She'll take you to waterfalls most tourists never see, through chocolate estates, and explain the medicinal plants along the way.",
      parish: "St. Andrew",
      priceAmount: "85.00",
      priceUnit: "person",
      avgRating: "4.97",
      reviewCount: 28,
      isFeatured: false,
      isInstantBook: true,
      typeData: { languages: ["English"], specialties: ["Nature", "Hiking", "Plants", "Photography"], yearsExperience: 8 },
      image: "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=800&q=80&auto=format",
    },
  ];

  for (const item of seedListings) {
    const { image, ...listingData } = item;

    const [created] = await db
      .insert(listings)
      .values({
        ...listingData,
        operatorId,
        islandId,
        status: "active",
        priceCurrency: "USD",
      })
      .onConflictDoNothing()
      .returning({ id: listings.id });

    if (created && image) {
      await db.insert(media).values({
        listingId: created.id,
        url: image,
        alt: item.title,
        type: "image",
        sortOrder: 0,
        isPrimary: true,
      });
    }

    console.log(`  Seeded: ${item.title}`);
  }

  console.log("\nDone! Seeded Grenada with listings.");
}

seed().catch(console.error);
