import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/server/admin-auth";
import { isMessageId } from "@/lib/message-input";

import { logger } from "@/lib/logger";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * POST — Translate a message using OpenAI
 * Body: { messageId: string, targetLanguage: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const userId = auth.userId;

    const { messageId, targetLanguage } = await request.json().catch(() => ({}));
    if (!isMessageId(messageId) || typeof targetLanguage !== "string" || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(targetLanguage)) {
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
      signal: AbortSignal.timeout(15000),
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
      logger.error("OpenAI translation error", await response.text());
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
      translatedText = typeof parsed.translated === "string" ? parsed.translated.slice(0, 10000) : "";
      sourceLanguage = typeof parsed.sourceLanguage === "string" && parsed.sourceLanguage.length <= 8 ? parsed.sourceLanguage : "unknown";
    } catch {
      // Fallback if OpenAI didn't return JSON
      translatedText = typeof assistantContent === "string" ? assistantContent.slice(0, 10000) : "";
      sourceLanguage = "unknown";
    }

    if (!translatedText) return NextResponse.json({ error: "Translation failed" }, { status: 502 });
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
    logger.error("Translate error", error);
    return NextResponse.json(
      { error: "Failed to translate message" },
      { status: 500 }
    );
  }
}
