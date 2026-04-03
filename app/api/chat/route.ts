import { NextResponse } from "next/server";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
  getIslandInfo,
  compareListings,
} from "@/server/concierge-tools";

// ─── System Prompt ──────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `You have access to real listing data, availability, and pricing across 21 Caribbean islands.

You can search for stays, tours, restaurants, events, transport, and more. When travelers ask for recommendations, ALWAYS use your search tools to find real listings rather than making generic suggestions. Include specific names, prices, and ratings from the results.

When suggesting listings, include the data from your tool results so the UI can render listing cards. Be specific — mention real names, prices, ratings, and locations from the search results.

Available islands: Grenada, Trinidad & Tobago, Barbados, St. Lucia, Jamaica, Bahamas, Aruba, Curacao, Dominican Republic, Antigua, Dominica, Turks & Caicos, Cayman Islands, Bonaire, St. Kitts, Martinique, Guadeloupe, USVI, BVI, Puerto Rico.

For trip planning, you can suggest the AI Trip Planner at /trips/new for a full itinerary builder.`;

// ─── Personalities ─────────────────────────────────────────────
const PERSONALITIES: Record<string, { name: string; prompt: string }> = {
  coral: {
    name: "Coral",
    prompt: `You are Coral — VakayGo's warm, knowledgeable AI Travel Concierge. You're like a best friend who's lived in the Caribbean for 20 years. Enthusiastic but not over-the-top. You give honest recommendations and aren't afraid to say "skip that tourist trap." Be concise (2-4 sentences + data). Use a warm, conversational tone.`,
  },
  captain: {
    name: "Captain Jack",
    prompt: `You are Captain Jack — VakayGo's seasoned island-hopping guide. You talk like a salty but lovable boat captain who's sailed every Caribbean island. Use nautical metaphors naturally ("smooth sailing," "anchor down at," "set course for"). You're opinionated about the best spots and have strong takes. Concise and colorful — 2-4 sentences + data. Drop the occasional "mon" or "aye" but don't overdo it.`,
  },
  luxe: {
    name: "Luxe",
    prompt: `You are Luxe — VakayGo's premium concierge specialist. You speak with refined elegance, like a five-star hotel concierge. Focus on the finest experiences, VIP services, and exclusive options. Use sophisticated language without being stuffy. Mention ambiance, exclusivity, and unique touches. Concise and polished — 2-4 sentences + data.`,
  },
  backpacker: {
    name: "Ziggy",
    prompt: `You are Ziggy — VakayGo's budget-savvy adventure guide. You're all about getting the most incredible experiences without breaking the bank. You prioritize hidden gems, street food, local spots, and budget stays. Enthusiastic and high-energy. Use casual language, get excited about deals and off-the-beaten-path discoveries. Concise — 2-4 sentences + data.`,
  },
  local: {
    name: "Auntie Mae",
    prompt: `You are Auntie Mae — VakayGo's local Caribbean insider. You grew up island-hopping and know every back road, family restaurant, and secret beach. You speak with Caribbean warmth, occasionally using local expressions and Creole/patois phrases (with translations). You care deeply about authentic culture and supporting local businesses. Concise and soulful — 2-4 sentences + data.`,
  },
  party: {
    name: "DJ Tropic",
    prompt: `You are DJ Tropic — VakayGo's nightlife and festival expert. You know every beach party, rum bar, carnival event, and live music venue across the Caribbean. High energy, fun vibes. You talk about "vibes," "energy," and the scene. Recommend the best spots for partying, festivals, and social experiences. Concise and hype — 2-4 sentences + data.`,
  },
};

function getSystemPrompt(personality: string = "coral"): string {
  const p = PERSONALITIES[personality] || PERSONALITIES.coral;
  return p.prompt + "\n\n" + BASE_SYSTEM_PROMPT;
}

// ─── Tool Definitions ───────────────────────────────────────────
const TOOLS = [
  {
    name: "search_listings",
    description:
      "Search VakayGo listings by type, island, price range, rating. Use this to find real stays, tours, restaurants, events, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "stay",
            "tour",
            "dining",
            "event",
            "transport",
            "excursion",
            "transfer",
            "vip",
            "guide",
          ],
          description: "Listing category",
        },
        island: {
          type: "string",
          description: "Island slug (e.g. grenada, barbados, jamaica)",
        },
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
    description:
      "Get full details for a specific listing including photos, reviews, availability",
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
        date: {
          type: "string",
          description: "Date to check (YYYY-MM-DD)",
        },
      },
      required: ["listingId", "date"],
    },
  },
  {
    name: "get_island_info",
    description:
      "Get information about a Caribbean island including listing counts, top-rated experiences",
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
    description: "Compare 2-3 listings side by side",
    input_schema: {
      type: "object" as const,
      properties: {
        slugs: {
          type: "array",
          items: { type: "string" },
          description: "Listing slugs to compare",
        },
        island: { type: "string" },
      },
      required: ["slugs", "island"],
    },
  },
];

// ─── Tool Executor ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: any): Promise<unknown> {
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
            title: item.title,
            slug: item.slug,
            island: item.island,
            type: item.type,
            price: item.price,
            rating: item.rating,
            image: item.image,
            url: item.url,
          });
        }
      }
    } else if (name === "get_listing_details" && result && !result.error) {
      if (!seen.has(result.slug)) {
        seen.add(result.slug);
        cards.push({
          title: result.title,
          slug: result.slug,
          island: result.island,
          type: result.type,
          price: result.price,
          rating: result.rating,
          image: result.images?.[0] || null,
          url: result.url,
        });
      }
    } else if (name === "compare_listings" && Array.isArray(result)) {
      for (const item of result) {
        if (!seen.has(item.slug)) {
          seen.add(item.slug);
          cards.push({
            title: item.title,
            slug: item.slug,
            island: item.island,
            type: item.type,
            price: item.price,
            rating: item.rating,
            image: null,
            url: item.url,
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
    const { messages, context, personality } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      personality?: string;
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
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Build system prompt with optional context
    let systemPrompt = getSystemPrompt(personality);
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

    // Prepare conversation messages for Claude
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiMessages: any[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const allToolResults: { name: string; result: unknown }[] = [];
    let finalText = "";
    const MAX_ITERATIONS = 3;

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
          max_tokens: 1024,
          system: systemPrompt,
          messages: apiMessages,
          tools: TOOLS,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Anthropic API error:", res.status, errorText);
        return NextResponse.json(
          { error: "Failed to get response from AI" },
          { status: 500 }
        );
      }

      const data = await res.json();

      // Check if we have tool_use blocks
      const toolUseBlocks = data.content?.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => b.type === "tool_use"
      ) || [];

      // Extract any text content
      const textBlocks = data.content?.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => b.type === "text"
      ) || [];

      if (textBlocks.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        finalText = textBlocks.map((b: any) => b.text).join("\n");
      }

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
        // If stop_reason is end_turn but there were tool calls, still process
        if (toolUseBlocks.length === 0) break;
      }

      // Execute all tool calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        try {
          const result = await executeTool(block.name, block.input);
          allToolResults.push({ name: block.name, result });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          console.error(`Tool ${block.name} error:`, err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({
              error: "Tool execution failed. Please try a different approach.",
            }),
            is_error: true,
          });
        }
      }

      // Add assistant message and tool results to conversation
      apiMessages = [
        ...apiMessages,
        { role: "assistant", content: data.content },
        { role: "user", content: toolResults },
      ];

      // If stop_reason was end_turn with tool calls, still need one more turn
      // to get the final text response
      if (data.stop_reason === "end_turn" && toolUseBlocks.length > 0) {
        continue;
      }
    }

    // Extract listing cards from tool results
    const listingCards = extractListings(allToolResults);

    return NextResponse.json({
      message:
        finalText ||
        "Sorry, I couldn't generate a response. Please try again!",
      ...(listingCards.length > 0 ? { listings: listingCards } : {}),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
