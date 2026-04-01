import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

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

    const { title, type, island, address, features } = await request.json();

    if (!title || !type) {
      return NextResponse.json(
        { error: "title and type are required" },
        { status: 400 }
      );
    }

    const locationContext =
      island || address
        ? `Location: ${[island, address].filter(Boolean).join(", ")}.`
        : "";

    const featuresContext =
      features && features.length > 0
        ? `Key features: ${features.join(", ")}.`
        : "";

    const systemPrompt = `You are a travel copywriter for VakayGo, a Caribbean travel platform. You write warm, vivid, and authentic listing descriptions that make travelers want to book immediately. You avoid generic travel clichés like "hidden gem", "paradise awaits", or "escape to". Instead, use specific sensory details and genuine enthusiasm. Always return valid JSON.`;

    const userPrompt = `Write a compelling, detailed description for a ${type} listing on VakayGo (Caribbean travel platform). Title: ${title}. ${locationContext} ${featuresContext}

Write 2-3 paragraphs, warm and inviting tone, highlight what makes this experience special. Include sensory details. Don't use generic travel clichés.

Also write a short catchy headline (under 120 characters) that captures the essence.

Return as JSON: { "description": "...", "headline": "..." }`;

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
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.8,
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

    // Parse JSON from the response
    let parsed: { description: string; headline: string };
    try {
      // Handle markdown code blocks wrapping JSON
      const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: use the raw content as description
      parsed = {
        description: content.trim(),
        headline: title,
      };
    }

    return NextResponse.json({
      description: parsed.description,
      headline: parsed.headline,
    });
  } catch (error) {
    console.error("Generate description error:", error);
    return NextResponse.json(
      { error: "Failed to generate description" },
      { status: 500 }
    );
  }
}
