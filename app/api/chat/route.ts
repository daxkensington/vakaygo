import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
  getIslandInfo,
  compareListings,
} from "@/server/concierge-tools";
import { createDb } from "@/server/db";
import { conciergeMemory } from "@/drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import { jwtVerify } from "jose";

import { logger } from "@/lib/logger";
// ─── Auth Helper ───────────────────────────────────────────────
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value || cookieStore.get("session")?.value;
    if (!token) return null;
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return (payload.id as string) || (payload.userId as string) || null;
  } catch {
    return null;
  }
}

// ─── Platform Knowledge Base ───────────────────────────────────
const PLATFORM_KNOWLEDGE = `
## VakayGo Platform Knowledge

You are embedded in VakayGo (vakaygo.com) — a Caribbean travel super-app covering 21 islands with 7,200+ listings.

### What You Can Help With:
- **Stays** — Hotels, villas, guesthouses, hostels. Search by island, price, rating, amenities (pool, beach, WiFi, kitchen, AC, pet-friendly).
- **Tours & Excursions** — Guided tours, boat trips, hiking, snorkeling, cultural tours. Search by duration, group size, price.
- **Dining** — Restaurants, street food, bars, cafes. Search by cuisine, price range ($ to $$$$), rating.
- **Events** — Festivals, parties, concerts, cultural events. Search by date, type, island.
- **Transport** — Airport transfers, car rentals, water taxis, ferries. Fixed pricing, no surge.
- **Local Guides** — Private tours, cultural immersion, photography, adventure guides. Rated and reviewed.
- **VIP Services** — Luxury concierge, security, executive transport, private experiences.

### Platform Features You Should Mention When Relevant:
- **AI Trip Planner** (/trips/new) — builds full day-by-day itineraries from real listings. Suggest this for multi-day trips.
- **Loyalty Program** — Explorer → Adventurer (2% off) → Voyager (5% off) → Captain (10% off). Earn 10 points per dollar. Users earn points on bookings, reviews, and referrals.
- **Promo Codes** — Users can apply promo codes at checkout for discounts.
- **Wishlist** (/saved) — Users can save listings to plan their trip.
- **Currency Converter** — Prices display in user's preferred currency (USD, EUR, CAD, GBP, XCD, etc.) with live exchange rates.
- **Instant Book** — Some listings can be booked immediately without operator approval.
- **Free Cancellation** — Many listings offer flexible cancellation (check cancellation policy per listing).
- **Reviews** — Verified reviews from guests who completed bookings. AI-powered review summaries available.
- **Messaging** (/messages) — Direct chat with operators/hosts before and after booking.
- **QR Vouchers** — Digital tickets/vouchers with QR codes for tours and events.
- **Multi-Language** — Site available in English, Spanish, French, Portuguese, Dutch, and German.

### 21 Caribbean Islands:
Grenada, Trinidad & Tobago, Barbados, St. Lucia, Jamaica, Bahamas, Antigua, Aruba, Dominican Republic, Puerto Rico, Curaçao, Cayman Islands, USVI, Dominica, St. Vincent, St. Kitts, Turks & Caicos, Bonaire, Martinique, Guadeloupe, BVI.

### Booking Flow:
1. User finds listing via search, AI recommendation, or browsing
2. Selects dates/guests/options
3. Sees price breakdown (base + service fee + taxes)
4. Applies promo code if available
5. Checks out via Stripe (secure payment)
6. Receives confirmation email + digital voucher/ticket
7. Can message operator directly
8. After experience, can leave a verified review

### Important Rules:
- ALWAYS use your search tools to find real listings — never make up listing names, prices, or details.
- Include specific names, prices ($), ratings (★), and island from search results.
- Keep responses concise: 2-4 sentences of personality-flavored commentary, then the data.
- If a user asks about something outside Caribbean travel, gently redirect.
- When users mention dates, check availability with the check_availability tool.
- For complex multi-day trips, suggest the AI Trip Planner at /trips/new.
- If users ask about their bookings, loyalty points, or account, direct them to the relevant page.
`;

// ─── Personality Definitions ───────────────────────────────────
const PERSONALITIES: Record<string, { name: string; prompt: string; voiceHint: string }> = {
  coral: {
    name: "Coral",
    voiceHint: "warm, friendly female voice",
    prompt: `You are Coral — VakayGo's warm, knowledgeable AI Travel Concierge. You're like a best friend who's lived in the Caribbean for 20 years. Enthusiastic but not over-the-top. You give honest recommendations and aren't afraid to say "skip that tourist trap." Use a warm, conversational tone.`,
  },
  captain: {
    name: "Captain Jack",
    voiceHint: "deep, confident male voice",
    prompt: `You are Captain Jack — VakayGo's seasoned island-hopping guide. You talk like a salty but lovable boat captain who's sailed every Caribbean island. Use nautical metaphors naturally ("smooth sailing," "anchor down at," "set course for"). You're opinionated about the best spots. Drop the occasional "mon" or "aye" but don't overdo it.`,
  },
  luxe: {
    name: "Luxe",
    voiceHint: "polished, refined female voice",
    prompt: `You are Luxe — VakayGo's premium concierge specialist. You speak with refined elegance, like a five-star hotel concierge. Focus on the finest experiences, VIP services, and exclusive options. Use sophisticated language without being stuffy. Mention ambiance, exclusivity, and unique touches.`,
  },
  backpacker: {
    name: "Ziggy",
    voiceHint: "energetic, youthful male voice",
    prompt: `You are Ziggy — VakayGo's budget-savvy adventure guide. You're all about getting incredible experiences without breaking the bank. You prioritize hidden gems, street food, local spots, and budget stays. Enthusiastic and high-energy. Get excited about deals and off-the-beaten-path discoveries.`,
  },
  local: {
    name: "Auntie Mae",
    voiceHint: "warm, nurturing female voice",
    prompt: `You are Auntie Mae — VakayGo's local Caribbean insider. You grew up island-hopping and know every back road, family restaurant, and secret beach. You speak with Caribbean warmth, occasionally using local expressions (with context so non-locals understand). You care deeply about authentic culture and supporting local businesses.`,
  },
  party: {
    name: "DJ Tropic",
    voiceHint: "energetic, upbeat male voice",
    prompt: `You are DJ Tropic — VakayGo's nightlife and festival expert. You know every beach party, rum bar, carnival event, and live music venue across the Caribbean. High energy, fun vibes. You talk about "vibes," "energy," and the scene. Recommend the best spots for partying, festivals, and social experiences.`,
  },
};

// ─── Memory System ─────────────────────────────────────────────
async function loadMemories(userId: string): Promise<string> {
  const db = createDb();
  try {
    const memories = await db
      .select({ category: conciergeMemory.category, fact: conciergeMemory.fact })
      .from(conciergeMemory)
      .where(eq(conciergeMemory.userId, userId))
      .orderBy(desc(conciergeMemory.lastUsedAt))
      .limit(20);

    if (memories.length === 0) return "";

    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m.fact);
    }

    let memoryPrompt = "\n\n## What You Remember About This User:\n";
    if (grouped.preference) memoryPrompt += `**Preferences:** ${grouped.preference.join(". ")}.\n`;
    if (grouped.personal) memoryPrompt += `**Personal:** ${grouped.personal.join(". ")}.\n`;
    if (grouped.trip_history) memoryPrompt += `**Past Trips:** ${grouped.trip_history.join(". ")}.\n`;
    if (grouped.interaction) memoryPrompt += `**Past Interactions:** ${grouped.interaction.join(". ")}.\n`;
    memoryPrompt += "\nUse this knowledge naturally — reference what you know when relevant but don't dump it all at once. Build on past conversations.\n";

    // Touch lastUsedAt for this user's memories (non-blocking)
    db.update(conciergeMemory)
      .set({ lastUsedAt: new Date() })
      .where(eq(conciergeMemory.userId, userId))
      .catch((e) => logger.error("Memory touch error", e));

    return memoryPrompt;
  } catch (e) {
    logger.error("Memory load error", e);
    return "";
  }
}

// ─── Memory Extraction Tool ────────────────────────────────────
const MEMORY_TOOL = {
  name: "save_memory",
  description: "Save something you learned about this user for future conversations. Use this when the user shares preferences (budget, interests, travel style), personal info (who they're traveling with, dietary needs, accessibility), or trip details (past/upcoming trips, favorite islands). Only save genuinely useful facts, not generic statements.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: ["preference", "personal", "trip_history", "interaction"],
        description: "Type of memory: preference (travel style, budget, interests), personal (family, dietary, accessibility), trip_history (past or planned trips), interaction (important things discussed)",
      },
      fact: {
        type: "string",
        description: "The specific fact to remember (e.g. 'Prefers boutique hotels over resorts', 'Traveling with a toddler', 'Loved Grand Anse Beach in Grenada')",
      },
    },
    required: ["category", "fact"],
  },
};

async function saveMemory(userId: string, category: string, fact: string, source?: string): Promise<{ saved: boolean }> {
  const db = createDb();
  try {
    // Check for duplicate/similar memory
    // Check for duplicates within the same category
    const existing = await db
      .select({ fact: conciergeMemory.fact })
      .from(conciergeMemory)
      .where(
        sql`${conciergeMemory.userId} = ${userId} AND ${conciergeMemory.category} = ${category}`
      )
      .limit(20);

    const factLower = fact.toLowerCase();
    const isDuplicate = existing.some(m => {
      const existingLower = m.fact.toLowerCase();
      return existingLower === factLower ||
        existingLower.includes(factLower.slice(0, 40)) ||
        factLower.includes(existingLower.slice(0, 40));
    });

    if (isDuplicate) {
      return { saved: false };
    }

    await db.insert(conciergeMemory).values({
      userId,
      category,
      fact,
      source,
    });

    return { saved: true };
  } catch (e) {
    logger.error("Memory save error", e);
    return { saved: false };
  }
}

// ─── Build System Prompt ───────────────────────────────────────
function buildSystemPrompt(personality: string, locale: string, memoryContext: string): string {
  const p = PERSONALITIES[personality] || PERSONALITIES.coral;

  let prompt = p.prompt + "\n\n" + PLATFORM_KNOWLEDGE + memoryContext;

  // Language instruction
  const LANGUAGE_MAP: Record<string, string> = {
    en: "English",
    es: "Spanish (Español)",
    fr: "French (Français)",
    pt: "Portuguese (Português)",
    nl: "Dutch (Nederlands)",
    de: "German (Deutsch)",
  };

  const lang = LANGUAGE_MAP[locale] || "English";
  if (locale !== "en") {
    prompt += `\n\n## Language\nThe user's interface is in ${lang}. Respond in ${lang}. Keep your personality and style but speak in ${lang}. Listing names should stay in their original language but your commentary should be in ${lang}.`;
  }

  // Concise output for voice
  prompt += `\n\nKeep responses concise: 2-4 sentences of commentary + listing data. This is critical for voice mode where long responses are tedious to listen to.`;

  return prompt;
}

// ─── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
  {
    name: "search_listings",
    description: "Search VakayGo's 7,200+ real listings by type, island, price range, rating. Use this to find stays, tours, restaurants, events, transport, guides, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["stay", "tour", "dining", "event", "transport", "excursion", "transfer", "vip", "guide"],
          description: "Listing category",
        },
        island: { type: "string", description: "Island slug (e.g. grenada, barbados, jamaica)" },
        q: { type: "string", description: "Search keywords" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        minRating: { type: "number" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
    },
  },
  {
    name: "get_listing_details",
    description: "Get full details for a specific listing including photos, reviews, availability, amenities",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "Listing slug" },
        island: { type: "string", description: "Island slug" },
      },
      required: ["slug", "island"],
    },
  },
  {
    name: "check_availability",
    description: "Check if a listing is available on specific dates",
    input_schema: {
      type: "object" as const,
      properties: {
        listingId: { type: "string" },
        date: { type: "string", description: "Date to check (YYYY-MM-DD)" },
      },
      required: ["listingId", "date"],
    },
  },
  {
    name: "get_island_info",
    description: "Get information about a Caribbean island including listing counts, top-rated experiences, and local tips",
    input_schema: {
      type: "object" as const,
      properties: {
        island: { type: "string", description: "Island slug" },
      },
      required: ["island"],
    },
  },
  {
    name: "compare_listings",
    description: "Compare 2-3 listings side by side on price, rating, amenities, and value",
    input_schema: {
      type: "object" as const,
      properties: {
        slugs: { type: "array", items: { type: "string" }, description: "Listing slugs to compare" },
        island: { type: "string" },
      },
      required: ["slugs", "island"],
    },
  },
];

// ─── Tool Executor ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: any, userId: string | null): Promise<unknown> {
  switch (name) {
    case "search_listings":
      return searchListings(input);
    case "get_listing_details":
      return getListingDetails(input);
    case "check_availability":
      return checkAvailability(input);
    case "get_island_info":
      return getIslandInfo(input);
    case "compare_listings":
      return compareListings(input);
    case "save_memory":
      if (!userId) return { saved: false, reason: "User not logged in" };
      return saveMemory(userId, input.category, input.fact, input.source);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Extract listing cards from tool results ────────────────────
type ListingCard = {
  title: string;
  slug: string;
  island: string;
  type: string;
  price: number | null;
  rating: number | null;
  image: string | null;
  url: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractListings(toolResults: { name: string; result: any }[]): ListingCard[] {
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  for (const { name, result } of toolResults) {
    if (name === "search_listings" && Array.isArray(result)) {
      for (const item of result) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          cards.push({
            title: item.title, slug: item.slug, island: item.island,
            type: item.type, price: item.price, rating: item.rating,
            image: item.image, url: item.url,
          });
        }
      }
    } else if (name === "get_listing_details" && result && !result.error) {
      if (!seen.has(result.slug)) {
        seen.add(result.slug);
        cards.push({
          title: result.title, slug: result.slug, island: result.island,
          type: result.type, price: result.price, rating: result.rating,
          image: result.images?.[0] || null, url: result.url,
        });
      }
    } else if (name === "compare_listings" && Array.isArray(result)) {
      for (const item of result) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          cards.push({
            title: item.title, slug: item.slug, island: item.island,
            type: item.type, price: item.price, rating: item.rating,
            image: null, url: item.url,
          });
        }
      }
    }
  }

  return cards;
}

// ─── POST Handler ───────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, context, personality, locale, voiceMode } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      personality?: string;
      locale?: string;
      voiceMode?: boolean;
      context?: {
        island?: string;
        type?: string;
        listingTitle?: string;
        listingSlug?: string;
        listingPrice?: string;
        pageUrl?: string;
      };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    // Get authenticated user for memory
    const userId = await getUserId();

    // Load user memories if logged in
    const memoryContext = userId ? await loadMemories(userId) : "";

    // Build the full system prompt with personality + platform knowledge + memory + language
    let systemPrompt = buildSystemPrompt(personality || "coral", locale || "en", memoryContext);

    if (context?.island) {
      systemPrompt += `\n\nThe user is currently browsing the island: ${context.island}. Prioritize recommendations for that island.`;
    }
    if (context?.type) {
      systemPrompt += `\n\nThe user is interested in ${context.type} experiences.`;
    }
    if (context?.listingTitle) {
      systemPrompt += `\n\nThe user is currently viewing the listing "${context.listingTitle}" (slug: ${context.listingSlug || "unknown"}, price: ${context.listingPrice || "unknown"}). They may be asking about this specific listing.`;
    }
    if (context?.pageUrl) {
      systemPrompt += `\n\nCurrent page URL: ${context.pageUrl}`;
    }

    // Voice mode: shorter responses for lower latency
    if (voiceMode) {
      systemPrompt += `\n\nKeep your response very short (1-2 sentences max) since the user is in voice mode and listening.`;
    }

    // Build tool list — include memory tool only for logged-in users
    const tools = userId ? [...TOOLS, MEMORY_TOOL] : TOOLS;

    // Prepare conversation messages for Claude
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const allToolResults: { name: string; result: unknown }[] = [];
    let finalText = "";
    const MAX_ITERATIONS = 4;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: voiceMode ? 300 : 1024,
          system: systemPrompt,
          messages: apiMessages,
          tools,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error("Anthropic API error", null, { status: res.status, body: errorText });
        return NextResponse.json({ error: "Failed to get response from AI" }, { status: 500 });
      }

      const data = await res.json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolUseBlocks = data.content?.filter((b: any) => b.type === "tool_use") || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlocks = data.content?.filter((b: any) => b.type === "text") || [];

      if (textBlocks.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        finalText = textBlocks.map((b: any) => b.text).join("\n");
      }

      if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
        if (toolUseBlocks.length === 0) break;
      }

      // Execute all tool calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        try {
          const result = await executeTool(block.name, block.input, userId);
          allToolResults.push({ name: block.name, result });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          logger.error("Chat tool execution failed", err, { tool: block.name });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ error: "Tool execution failed." }),
            is_error: true,
          });
        }
      }

      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: data.content },
        { role: "user", content: toolResults },
      ];

      if (data.stop_reason === "end_turn" && toolUseBlocks.length > 0) {
        continue;
      }
    }

    const listingCards = extractListings(allToolResults);

    return NextResponse.json({
      message: finalText || "Sorry, I couldn't generate a response. Please try again!",
      ...(listingCards.length > 0 ? { listings: listingCards } : {}),
    });
  } catch (error) {
    logger.error("Chat API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
