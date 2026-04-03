import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { query, resultCount, topResults } = await request.json();

    if (typeof resultCount !== "number") {
      return NextResponse.json(
        { error: "resultCount is required" },
        { status: 400 }
      );
    }

    const topResultsText =
      Array.isArray(topResults) && topResults.length > 0
        ? topResults
            .slice(0, 5)
            .map(
              (r: { title: string; type: string; rating?: number; price?: number }) =>
                `${r.title} (${r.type}${r.rating ? `, ${r.rating} stars` : ""}${r.price ? `, $${r.price}` : ""})`
            )
            .join(", ")
        : "none";

    const systemPrompt = `You are VakayGo's search results commentator. Given search results data, generate a brief, friendly 1-2 sentence summary that highlights the best finds. Be concise and helpful. Mention the highest-rated or best-value options when available. Do not use markdown. Do not repeat the user's query verbatim.`;

    const userMessage = `Search query: "${query || "browse all"}"
Results found: ${resultCount}
Top results: ${topResultsText}

Write a 1-2 sentence summary of these results.`;

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
          { role: "user", content: userMessage },
        ],
        max_tokens: 150,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Grok search summary error:", err);
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Search summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate search summary" },
      { status: 500 }
    );
  }
}
