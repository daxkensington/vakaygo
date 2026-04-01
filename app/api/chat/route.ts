import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are VakayGo's AI travel concierge — a friendly, knowledgeable Caribbean travel expert. You help travelers discover experiences across 21 Caribbean islands.

You can help with:
- Recommending islands, activities, restaurants, and experiences
- Answering questions about Caribbean travel (weather, culture, safety, currency)
- Suggesting itineraries and trip planning
- Comparing destinations

Keep responses concise (2-4 sentences usually). Be warm and enthusiastic about Caribbean travel. Use island-specific knowledge when possible.

Available islands: Grenada, Trinidad & Tobago, Barbados, St. Lucia, Jamaica, Bahamas, Aruba, Curaçao, Dominican Republic, Antigua, Dominica, Turks & Caicos, Cayman Islands, Bonaire, St. Kitts, Martinique, Guadeloupe, USVI, BVI, Puerto Rico.

When recommending activities, suggest they check VakayGo's explore page. For trip planning, suggest the AI Trip Planner at /trips/new.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, context } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      context?: { island?: string; type?: string };
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
      systemPrompt += `\n\nThe user is currently browsing ${context.island}. Prioritize recommendations for that island.`;
    }
    if (context?.type) {
      systemPrompt += `\n\nThe user is interested in ${context.type} experiences.`;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
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
    const message =
      data.content?.[0]?.type === "text"
        ? data.content[0].text
        : "Sorry, I couldn't generate a response. Please try again!";

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
