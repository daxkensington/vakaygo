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

    const systemPrompt = `You are a search query parser for VakayGo, a Caribbean travel platform. Parse the user's natural language travel search query into structured filters.

Return ONLY valid JSON with these optional fields:
{
  "type": one of "stay", "tour", "dining", "event", "transport", "excursion", "transfer", "vip", "guide" (only if clearly mentioned),
  "island": island slug like "grenada", "barbados", "jamaica", "st-lucia", "trinidad-and-tobago", "antigua", "dominica", "bahamas", "aruba", "curacao", "cayman-islands", "puerto-rico", "dominican-republic" (only if clearly mentioned),
  "minPrice": number (only if a budget floor is mentioned),
  "maxPrice": number (only if a budget ceiling is mentioned),
  "minRating": number between 1-5 (only if quality preference is mentioned),
  "q": keyword string for text search (extract the key subject/activity)
}

Only include fields that are clearly indicated by the query. If the user mentions "cheap" or "budget", set maxPrice to around 50-100. If they say "luxury" or "premium", set minPrice to 200+. If they mention "best" or "top-rated", set minRating to 4.5.

Examples:
- "romantic dinner in Grenada" -> {"type":"dining","island":"grenada","q":"romantic"}
- "cheap hotels in Jamaica" -> {"type":"stay","island":"jamaica","maxPrice":100}
- "best snorkeling tours" -> {"type":"excursion","minRating":4.5,"q":"snorkeling"}`;

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

    let filters: Record<string, unknown>;
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      filters = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, just use the query as keyword search
      filters = { q: query };
    }

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

    return NextResponse.json({ filters });
  } catch (error) {
    console.error("Smart search error:", error);
    return NextResponse.json(
      { error: "Failed to parse search query" },
      { status: 500 }
    );
  }
}
