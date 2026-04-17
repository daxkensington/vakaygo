import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const STYLE_PREFIXES: Record<string, string> = {
  photo:
    "Professional travel photography, 4K, vibrant colors, Caribbean setting. ",
  illustration:
    "Beautiful watercolor illustration, travel art style, Caribbean theme. ",
  aerial:
    "Stunning aerial drone photography, turquoise waters, Caribbean island. ",
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

    const { prompt, style = "photo" } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const stylePrefix = STYLE_PREFIXES[style] || STYLE_PREFIXES.photo;
    const fullPrompt = `${stylePrefix}${prompt}`;

    // Generate image via Grok API
    const grokRes = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: fullPrompt,
        n: 1,
      }),
    });

    if (!grokRes.ok) {
      const err = await grokRes.text();
      logger.error("Grok image generation error", err);
      return NextResponse.json(
        { error: "Image generation failed" },
        { status: 502 }
      );
    }

    const grokData = await grokRes.json();
    const imageResult = grokData.data?.[0];

    if (!imageResult) {
      return NextResponse.json(
        { error: "No image generated" },
        { status: 502 }
      );
    }

    // Get the image data - either from URL or b64_json
    let imageBuffer: Buffer;

    if (imageResult.b64_json) {
      imageBuffer = Buffer.from(imageResult.b64_json, "base64");
    } else if (imageResult.url) {
      const imgRes = await fetch(imageResult.url);
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: "Failed to download generated image" },
          { status: 502 }
        );
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json(
        { error: "No image data in response" },
        { status: 502 }
      );
    }

    // Upload to Vercel Blob
    const filename = `blog/ai-generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const blob = await put(filename, imageBuffer, {
      access: "public",
      contentType: "image/png",
    });

    return NextResponse.json({
      url: blob.url,
      prompt: fullPrompt,
    });
  } catch (error) {
    logger.error("Image generation error", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
