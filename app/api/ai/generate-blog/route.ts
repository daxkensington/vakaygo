import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const TONE_INSTRUCTIONS: Record<string, string> = {
  informative:
    "Write in an informative, authoritative tone. Include practical details, statistics, and insider tips.",
  casual:
    "Write in a casual, conversational tone. Use friendly language, personal touches, and relatable anecdotes.",
  luxury:
    "Write in a sophisticated, aspirational tone. Emphasize exclusivity, premium experiences, and refined details.",
  adventure:
    "Write in an exciting, energetic tone. Use vivid action-oriented language and emphasize thrill and discovery.",
};

export async function POST(request: Request) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await jwtVerify(token, SECRET);

    const { title, category, island, tone = "informative", outline } =
      await request.json();

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const toneInstruction =
      TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.informative;

    const systemPrompt = `You are VakayGo's travel content writer. Write engaging, SEO-friendly Caribbean travel content. Include practical tips, insider knowledge, and vivid descriptions. Format in Markdown with proper headings (## and ###).

${toneInstruction}

Write content that is 800-1200 words. Include:
- An engaging introduction
- Well-structured sections with ## and ### headings
- Practical tips and recommendations
- A compelling conclusion

Also provide:
- 5-8 relevant SEO tags
- A concise meta description (150-160 characters)

Return ONLY valid JSON:
{
  "content": "markdown content here",
  "suggestedTags": ["tag1", "tag2", ...],
  "metaDescription": "SEO meta description here"
}`;

    const userMessage = `Write a blog post with the following details:
Title: ${title}
${category ? `Category: ${category}` : ""}
${island ? `Island/Location: ${island}` : ""}
${outline ? `Key points to cover:\n${outline}` : ""}

Generate the full blog post content in Markdown format.`;

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
          { role: "user", content: userMessage },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error("OpenAI blog generation error", err);
      return NextResponse.json(
        { error: "Blog generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

    let result: {
      content: string;
      suggestedTags: string[];
      metaDescription: string;
    };

    try {
      const jsonStr = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      result = JSON.parse(jsonStr);
    } catch {
      // If JSON parsing fails, treat the whole response as content
      result = {
        content: rawContent,
        suggestedTags: [],
        metaDescription: "",
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Blog generation error", error);
    return NextResponse.json(
      { error: "Failed to generate blog content" },
      { status: 500 }
    );
  }
}
