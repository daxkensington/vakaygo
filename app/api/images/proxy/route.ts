import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
export const runtime = "edge";

// Cap upstream response so a malicious link can't tie up the proxy.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// Only the hosts getImageUrl() actually proxies (hotlink-blocked CDNs)
// plus legacy Google Places. An allowlist kills the whole SSRF class —
// the old blocklist missed IPv6 literals, decimal IPs, and DNS rebinds.
const ALLOWED_HOST_SUFFIXES = [
  "fbcdn.net",
  "fbsbx.com",
  "yelpcdn.com",
  "googleapis.com",
];

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const host = parsed.hostname.toLowerCase();
  if (!isAllowedHost(host)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  // For Google Places, append the API key
  let fullUrl = url;
  if (host.endsWith("googleapis.com")) {
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

    const contentType = imageRes.headers.get("Content-Type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const declaredLen = parseInt(imageRes.headers.get("Content-Length") || "0", 10);
    if (declaredLen && declaredLen > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    if (imageBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    logger.error("Image proxy error", error);
    return NextResponse.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
