import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
export const runtime = "edge";

const ALLOWED_HOSTS = [
  "googleapis.com",
  "images.unsplash.com",
  "imgen.x.ai",
  "scontent.xx.fbcdn.net",
  "external.xx.fbcdn.net",
  "lookaside.fbsbx.com",
  "s3-media",
  "yelpcdn.com",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsedHost: string;
  try {
    parsedHost = new URL(url).hostname;
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((h) => parsedHost.endsWith(h))) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  // For Google Places, append the API key
  let fullUrl = url;
  if (url.includes("googleapis.com")) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }
    const separator = url.includes("?") ? "&" : "?";
    fullUrl = url.includes("key=") ? url : `${url}${separator}key=${apiKey}`;
  }

  try {
    const imageRes = await fetch(fullUrl, {
      headers: { Accept: "image/*" },
    });

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image", status: imageRes.status },
        { status: 502 }
      );
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get("Content-Type") || "image/jpeg";

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    logger.error("Image proxy error", error);
    return NextResponse.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
