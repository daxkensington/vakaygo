import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.includes("googleapis.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Always append current API key (getImageUrl strips any stale key from stored URLs)
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = url.includes("key=") ? url : `${url}${separator}key=${apiKey}`;

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
    console.error("Image proxy error:", error);
    return NextResponse.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
