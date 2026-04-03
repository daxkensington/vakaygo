import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are VakayGo's search intelligence. Parse natural language travel queries into structured filters AND generate a friendly search summary.

Parse into filters:
{
  "type": one of "stay", "tour", "dining", "event", "transport", "excursion", "transfer", "vip", "guide" (only if clearly mentioned),
  "island": island slug like "grenada", "barbados", "jamaica", "st-lucia", "trinidad-and-tobago", "antigua", "dominica", "bahamas", "aruba", "curacao", "cayman-islands", "puerto-rico", "dominican-republic" (only if clearly mentioned),
  "q": keyword string for text search (extract the key subject/activity),
  "minPrice": number (only if a budget floor is mentioned),
  "maxPrice": number (only if a budget ceiling is mentioned),
  "minRating": number between 1-5 (only if quality preference is mentioned),
  "guests": number (only if group size is mentioned),
  "amenities": array from ["wifi", "pool", "ac", "kitchen", "parking", "beach-access", "ocean-view", "pet-friendly"] (only if clearly mentioned),
  "duration": one of "under-2", "2-4", "4-8", "full-day", "multi-day" (only if duration is mentioned)
}

Also return:
{
  "summary": "A friendly 1-sentence description of what we're searching for",
  "suggestions": ["related search 1", "related search 2", "related search 3"]
}

Only include filter fields that are clearly indicated by the query. If the user mentions "cheap" or "budget", set maxPrice to around 50-100. If they say "luxury" or "premium", set minPrice to 200+. If they mention "best" or "top-rated", set minRating to 4.5.

Return ONLY valid JSON with this structure:
{
  "filters": { ... },
  "summary": "...",
  "suggestions": ["...", "...", "..."]
}

Examples:
- "romantic dinner spot with ocean view in Grenada" -> {"filters":{"type":"dining","island":"grenada","q":"romantic ocean view","amenities":["ocean-view"]},"summary":"Searching for romantic oceanfront restaurants in Grenada","suggestions":["Grenada sunset dining","Best date night restaurants","Beachside bars in Grenada"]}
- "family friendly snorkeling" -> {"filters":{"type":"excursion","q":"snorkeling family"},"summary":"Looking for family-friendly snorkeling experiences","suggestions":["Kid-friendly water sports","Glass bottom boat tours","Beach activities for families"]}
- "cheap hotels with pool in Jamaica" -> {"filters":{"type":"stay","island":"jamaica","maxPrice":100,"q":"hotel","amenities":["pool"]},"summary":"Finding budget-friendly hotels with pools in Jamaica","suggestions":["Jamaica beachfront stays","All-inclusive resorts Jamaica","Budget hostels in Montego Bay"]}`;

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Grok error:", err);
      return NextResponse.json(
        { error: "AI search parsing failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: {
      filters: Record<string, unknown>;
      summary: string;
      suggestions: string[];
    };

    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, try to extract just filters
      try {
        const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
        const filters = JSON.parse(jsonStr);
        parsed = {
          filters,
          summary: `Searching for "${query}"`,
          suggestions: [],
        };
      } catch {
        parsed = {
          filters: { q: query },
          summary: `Searching for "${query}"`,
          suggestions: [],
        };
      }
    }

    const { filters, summary, suggestions } = parsed;

    // Validate and sanitize filters
    const validTypes = [
      "stay",
      "tour",
      "dining",
      "event",
      "transport",
      "excursion",
      "transfer",
      "vip",
      "guide",
    ];
    if (filters.type && !validTypes.includes(filters.type as string)) {
      delete filters.type;
    }

    if (filters.minPrice && typeof filters.minPrice !== "number") {
      filters.minPrice = parseFloat(filters.minPrice as string) || undefined;
    }
    if (filters.maxPrice && typeof filters.maxPrice !== "number") {
      filters.maxPrice = parseFloat(filters.maxPrice as string) || undefined;
    }
    if (filters.minRating && typeof filters.minRating !== "number") {
      filters.minRating = parseFloat(filters.minRating as string) || undefined;
    }
    if (filters.guests && typeof filters.guests !== "number") {
      filters.guests = parseInt(filters.guests as string) || undefined;
    }

    // Validate amenities
    const validAmenities = [
      "wifi",
      "pool",
      "ac",
      "kitchen",
      "parking",
      "beach-access",
      "ocean-view",
      "pet-friendly",
    ];
    if (Array.isArray(filters.amenities)) {
      filters.amenities = (filters.amenities as string[]).filter((a) =>
        validAmenities.includes(a)
      );
      if ((filters.amenities as string[]).length === 0) delete filters.amenities;
    } else {
      delete filters.amenities;
    }

    // Validate duration
    const validDurations = ["under-2", "2-4", "4-8", "full-day", "multi-day"];
    if (
      filters.duration &&
      !validDurations.includes(filters.duration as string)
    ) {
      delete filters.duration;
    }

    return NextResponse.json({
      filters,
      summary: summary || `Searching for "${query}"`,
      suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 3) : [],
    });
  } catch (error) {
    console.error("Smart search error:", error);
    return NextResponse.json(
      { error: "Failed to parse search query" },
      { status: 500 }
    );
  }
}
