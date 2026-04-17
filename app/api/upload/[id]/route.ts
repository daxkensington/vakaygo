import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { media } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { del } from "@vercel/blob";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await jwtVerify(token, SECRET);

    const { id } = await params;
    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get media record
    const [record] = await db
      .select({ id: media.id, url: media.url })
      .from(media)
      .where(eq(media.id, id));

    if (!record) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    // Delete from Vercel Blob
    try {
      await del(record.url);
    } catch (blobErr) {
      logger.error("Blob deletion error (continuing)", blobErr);
      // Continue even if blob delete fails — still remove DB record
    }

    // Delete from database
    await db.delete(media).where(eq(media.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Delete media error", err);
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 }
    );
  }
}
