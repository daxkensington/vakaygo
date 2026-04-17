import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, type, businessName } = body;

    if (!email || !name) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    if (process.env.DATABASE_URL) {
      const { neon } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-http");
      const { waitlist } = await import("@/drizzle/schema");

      const sql = neon(process.env.DATABASE_URL);
      const db = drizzle(sql);

      await db
        .insert(waitlist)
        .values({
          name,
          email,
          type: type || "traveler",
          businessName: businessName || null,
        })
        .onConflictDoNothing({ target: waitlist.email });
    } else {
      logger.info("Waitlist signup (no DB)", { extra: {
        name,
        email,
        type,
        businessName,
      } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Waitlist error", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
