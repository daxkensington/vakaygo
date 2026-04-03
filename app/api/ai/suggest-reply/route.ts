import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "operator" && payload.role !== "admin") {
      return NextResponse.json({ error: "Operators only" }, { status: 403 });
    }

    const { reviewText, reviewRating, listingTitle } = await request.json();

    if (!reviewText || !reviewRating || !listingTitle) {
      return NextResponse.json(
        { error: "reviewText, reviewRating, and listingTitle are required" },
        { status: 400 }
      );
    }

    const isNegative = reviewRating <= 2;
    const isMixed = reviewRating === 3;

    const toneGuidance = isNegative
      ? "The review is negative. Replies should be empathetic, acknowledge the concerns specifically, apologize sincerely, and offer a resolution or next step. Never be defensive."
      : isMixed
        ? "The review is mixed. Replies should thank for the feedback, acknowledge both the positives and the concerns, and show commitment to improvement."
        : "The review is positive. Replies should express genuine gratitude, reinforce what was praised specifically, and warmly invite them back.";

    const systemPrompt = `You are helping a Caribbean tourism operator respond to a guest review for their listing "${listingTitle}" on VakayGo. ${toneGuidance}

Generate exactly 3 reply options. Each must be personalized to the specific review content. Never use generic templates. Reference specific things the reviewer mentioned.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "replies": [
    {
      "style": "Professional & Warm",
      "text": "The reply text (2-4 sentences)"
    },
    {
      "style": "Brief & Friendly",
      "text": "The reply text (1-2 sentences)"
    },
    {
      "style": "Detailed & Helpful",
      "text": "The reply text (3-5 sentences, includes actionable info)"
    }
  ]
}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Review (${reviewRating}/5 stars): ${reviewText}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI error:", err);
      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: { replies: { style: string; text: string }[] };
    try {
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse suggest-reply JSON:", content);
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json({ replies: parsed.replies });
  } catch (error) {
    console.error("Suggest reply error:", error);
    return NextResponse.json(
      { error: "Failed to generate reply suggestions" },
      { status: 500 }
    );
  }
}
