import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { listings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-change-in-production"
);

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

const SUPPORTED_LOCALES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  nl: "Dutch",
  de: "German",
  ar: "Arabic",
};

export async function POST(request: Request) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { listingId, targetLocale } = await request.json();

    if (!listingId || !targetLocale) {
      return NextResponse.json(
        { error: "listingId and targetLocale are required" },
        { status: 400 }
      );
    }

    const targetLanguage = SUPPORTED_LOCALES[targetLocale];
    if (!targetLanguage) {
      return NextResponse.json(
        { error: `Unsupported locale: ${targetLocale}. Supported: ${Object.keys(SUPPORTED_LOCALES).join(", ")}` },
        { status: 400 }
      );
    }

    const db = getDb();

    // Fetch the listing
    const [listing] = await db
      .select({
        id: listings.id,
        title: listings.title,
        description: listings.description,
        headline: listings.headline,
        typeData: listings.typeData,
        operatorId: listings.operatorId,
      })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Only the operator or admin can translate
    if (listing.operatorId !== userId && payload.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if translation already exists
    const existingTranslations =
      (listing.typeData as Record<string, unknown>)?.translations as
        | Record<string, { title: string; description: string; headline?: string }>
        | undefined;

    if (existingTranslations?.[targetLocale]) {
      return NextResponse.json({
        translation: existingTranslations[targetLocale],
        cached: true,
      });
    }

    // Build content to translate
    const textsToTranslate: Record<string, string> = {
      title: listing.title,
      description: listing.description || "",
    };
    if (listing.headline) {
      textsToTranslate.headline = listing.headline;
    }

    // Call OpenAI via fetch (matching existing codebase pattern)
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a professional translator for a Caribbean travel platform. Translate the following listing content from English to ${targetLanguage}. Maintain the tone, marketing appeal, and formatting. Return a JSON object with the same keys (title, description${listing.headline ? ", headline" : ""}) translated. Only return valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: JSON.stringify(textsToTranslate),
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("OpenAI API error:", res.status, errorBody);
      return NextResponse.json(
        { error: "Translation failed — AI service error" },
        { status: 502 }
      );
    }

    const aiResponse = await res.json();
    const translatedText = aiResponse.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return NextResponse.json(
        { error: "Translation failed — no response from AI" },
        { status: 500 }
      );
    }

    let translation: { title: string; description: string; headline?: string };
    try {
      translation = JSON.parse(translatedText);
    } catch {
      return NextResponse.json(
        { error: "Translation failed — invalid response format" },
        { status: 500 }
      );
    }

    // Store translation in typeData.translations.{locale}
    const currentTypeData = (listing.typeData as Record<string, unknown>) || {};
    const currentTranslations =
      (currentTypeData.translations as Record<string, unknown>) || {};

    const updatedTypeData = {
      ...currentTypeData,
      translations: {
        ...currentTranslations,
        [targetLocale]: translation,
      },
    };

    await db
      .update(listings)
      .set({ typeData: updatedTypeData })
      .where(eq(listings.id, listingId));

    return NextResponse.json({ translation, cached: false });
  } catch (error) {
    console.error("Translate listing error:", error);
    return NextResponse.json(
      { error: "Failed to translate listing" },
      { status: 500 }
    );
  }
}
