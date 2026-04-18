import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
export const runtime = "edge";

// Cap upstream response so a malicious link can't tie up the proxy.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// Reject SSRF targets even if a caller hand-crafts the URL.
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
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
  if (BLOCKED_HOSTS.has(host) || isPrivateIPv4(host)) {
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
