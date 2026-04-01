import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages, users, listings } from "@/drizzle/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function GET() {
  try {
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const sender = alias(users, "sender");
    const receiver = alias(users, "receiver");

    // Total messages
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages);

    // Unread messages
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.isRead, false));

    // Messages today
    const [todayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(sql`${messages.createdAt}::date = CURRENT_DATE`);

    // Active conversations (unique sender-receiver pairs)
    const [conversationsResult] = await db
      .select({
        count: sql<number>`count(DISTINCT LEAST(${messages.senderId}::text, ${messages.receiverId}::text) || '|' || GREATEST(${messages.senderId}::text, ${messages.receiverId}::text))::int`,
      })
      .from(messages);

    // Recent 20 messages with sender/receiver names, listing title
    const recentMessages = await db
      .select({
        id: messages.id,
        content: messages.content,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        senderName: sender.name,
        senderEmail: sender.email,
        receiverName: receiver.name,
        receiverEmail: receiver.email,
        listingId: messages.listingId,
        listingTitle: listings.title,
      })
      .from(messages)
      .innerJoin(sender, eq(messages.senderId, sender.id))
      .innerJoin(receiver, eq(messages.receiverId, receiver.id))
      .leftJoin(listings, eq(messages.listingId, listings.id))
      .orderBy(desc(messages.createdAt))
      .limit(20);

    return NextResponse.json({
      stats: {
        total: totalResult.count,
        unread: unreadResult.count,
        today: todayResult.count,
        activeConversations: conversationsResult.count,
      },
      messages: recentMessages,
    });
  } catch (error) {
    console.error("Admin messages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
