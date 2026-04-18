import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { media, listings } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { payload } = await jwtVerify(token, SECRET);
    const userId = payload.id as string;
    const role = payload.role as string;

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const listingId = formData.get("listingId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // If a listingId is supplied, the uploader must own it (or be admin).
    // Without this gate any session could attach images to any listing.
    if (listingId) {
      const db = drizzle(neon(process.env.DATABASE_URL!));
      const [target] = await db
        .select({ operatorId: listings.operatorId })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!target) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      if (target.operatorId !== userId && role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: jpeg, png, webp, gif" },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum 5MB" },
        { status: 400 }
      );
    }

    // Generate a unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `listings/${listingId || "general"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    });

    let mediaId: string | undefined;

    // If listingId provided, create a media record
    if (listingId) {
      const db = drizzle(neon(process.env.DATABASE_URL!));

      // Get current max sortOrder for this listing
      const existing = await db
        .select({ sortOrder: media.sortOrder })
        .from(media)
        .where(eq(media.listingId, listingId))
        .orderBy(desc(media.sortOrder))
        .limit(1);

      const nextSort = existing.length > 0 ? (existing[0].sortOrder ?? 0) + 1 : 0;
      const isPrimary = nextSort === 0;

      const [inserted] = await db
        .insert(media)
        .values({
          listingId,
          url: blob.url,
          alt: file.name.replace(/\.[^.]+$/, ""),
          type: "image",
          sortOrder: nextSort,
          isPrimary,
        })
        .returning({ id: media.id });

      mediaId = inserted.id;
    }

    return NextResponse.json({ url: blob.url, mediaId });
  } catch (err) {
    logger.error("Upload error", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
