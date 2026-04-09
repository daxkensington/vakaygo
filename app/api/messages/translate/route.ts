import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Translate a message using OpenAI
 * Body: { messageId: string, targetLanguage: string }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;

    const { messageId, targetLanguage } = await request.json();
    if (!messageId || !targetLanguage) {
      return NextResponse.json(
        { error: "messageId and targetLanguage required" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Fetch the message (user must be sender or receiver)
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.senderId !== userId && message.receiverId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Call OpenAI to translate
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "Translation service unavailable" },
        { status: 503 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else. Also detect the source language and include it as a JSON response like: {"translated": "...", "sourceLanguage": "en"}`,
          },
          { role: "user", content: message.content },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI translation error:", await response.text());
      return NextResponse.json(
        { error: "Translation failed" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const assistantContent = data.choices?.[0]?.message?.content || "";

    let translatedText: string;
    let sourceLanguage: string;

    try {
      const parsed = JSON.parse(assistantContent);
      translatedText = parsed.translated;
      sourceLanguage = parsed.sourceLanguage || "unknown";
    } catch {
      // Fallback if OpenAI didn't return JSON
      translatedText = assistantContent;
      sourceLanguage = "unknown";
    }

    // Store translation in the message row
    await db
      .update(messages)
      .set({
        translatedContent: translatedText,
        sourceLanguage,
        targetLanguage,
      })
      .where(eq(messages.id, messageId));

    return NextResponse.json({
      translatedContent: translatedText,
      sourceLanguage,
      targetLanguage,
    });
  } catch (error) {
    console.error("Translate error:", error);
    return NextResponse.json(
      { error: "Failed to translate message" },
      { status: 500 }
    );
  }
}
