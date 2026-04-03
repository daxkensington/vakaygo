import { NextResponse } from "next/server";
import {
  searchListings,
  getListingDetails,
  checkAvailability,
  getIslandInfo,
  compareListings,
} from "@/server/concierge-tools";

// ─── System Prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are VakayGo's AI Travel Concierge — a knowledgeable, enthusiastic Caribbean travel expert embedded in the platform. You have access to real listing data, availability, and pricing across 21 Caribbean islands.

You can search for stays, tours, restaurants, events, transport, and more. When travelers ask for recommendations, ALWAYS use your search tools to find real listings rather than making generic suggestions. Include specific names, prices, and ratings from the results.

When suggesting listings, include the data from your tool results so the UI can render listing cards. Be specific — mention real names, prices, ratings, and locations from the search results.

Be warm, concise (2-4 sentences of commentary + data). Use island-specific knowledge. If unsure about something, search first.

Available islands: Grenada, Trinidad & Tobago, Barbados, St. Lucia, Jamaica, Bahamas, Aruba, Curacao, Dominican Republic, Antigua, Dominica, Turks & Caicos, Cayman Islands, Bonaire, St. Kitts, Martinique, Guadeloupe, USVI, BVI, Puerto Rico.

For trip planning, you can suggest the AI Trip Planner at /trips/new for a full itinerary builder.`;

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
    const { messages, context } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
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
    let systemPrompt = SYSTEM_PROMPT;
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
