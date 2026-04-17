import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages, users, listings } from "@/drizzle/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { id: string; email: string; name: string; role: string };
  } catch {
    return null;
  }
}

// GET conversations list or messages for a specific conversation
export async function GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const withUserId = searchParams.get("with");
    const listingId = searchParams.get("listingId");

    const db = drizzle(neon(process.env.DATABASE_URL!));

    if (withUserId) {
      // Get messages in a conversation
      const conditions = [
        or(
          and(eq(messages.senderId, user.id), eq(messages.receiverId, withUserId)),
          and(eq(messages.senderId, withUserId), eq(messages.receiverId, user.id))
        ),
      ];
      if (listingId) {
        conditions.push(eq(messages.listingId, listingId));
      }

      const msgs = await db
        .select({
          id: messages.id,
          content: messages.content,
          senderId: messages.senderId,
          receiverId: messages.receiverId,
          attachmentUrl: messages.attachmentUrl,
          attachmentType: messages.attachmentType,
          isRead: messages.isRead,
          createdAt: messages.createdAt,
          senderName: users.name,
          senderAvatar: users.avatarUrl,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(and(...conditions))
        .orderBy(messages.createdAt)
        .limit(100);

      // Mark received messages as read
      await db
        .update(messages)
        .set({ isRead: true })
        .where(and(eq(messages.receiverId, user.id), eq(messages.senderId, withUserId)));

      return NextResponse.json({ messages: msgs });
    }

    // Get conversations list (unique users I've messaged with)
    const sent = await db
      .select({
        id: messages.id,
        userId: messages.receiverId,
        content: messages.content,
        createdAt: messages.createdAt,
        listingId: messages.listingId,
      })
      .from(messages)
      .where(eq(messages.senderId, user.id))
      .orderBy(desc(messages.createdAt));

    const received = await db
      .select({
        id: messages.id,
        userId: messages.senderId,
        content: messages.content,
        createdAt: messages.createdAt,
        listingId: messages.listingId,
        isRead: messages.isRead,
      })
      .from(messages)
      .where(eq(messages.receiverId, user.id))
      .orderBy(desc(messages.createdAt));

    // Build conversations
    const convMap = new Map<string, { userId: string; lastMessage: string; lastDate: string; unread: number; listingId: string | null }>();

    for (const msg of [...sent, ...received]) {
      const key = msg.userId;
      if (!convMap.has(key)) {
        convMap.set(key, {
          userId: msg.userId,
          lastMessage: msg.content,
          lastDate: msg.createdAt.toISOString(),
          unread: 0,
          listingId: msg.listingId,
        });
      }
    }

    // Count unread
    for (const msg of received) {
      if (!msg.isRead) {
        const conv = convMap.get(msg.userId);
        if (conv) conv.unread++;
      }
    }

    // Get user names
    const conversations = await Promise.all(
      Array.from(convMap.values()).map(async (conv) => {
        const [u] = await db
          .select({ name: users.name, businessName: users.businessName })
          .from(users)
          .where(eq(users.id, conv.userId))
          .limit(1);
        return { ...conv, name: u?.businessName || u?.name || "User" };
      })
    );

    conversations.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

    return NextResponse.json({ conversations });
  } catch (error) {
    logger.error("Messages error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST send a message
export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { receiverId, content, listingId, bookingId, attachmentUrl, attachmentType } = await request.json();

    if (!receiverId || (!content && !attachmentUrl)) {
      return NextResponse.json({ error: "receiverId and content (or attachment) required" }, { status: 400 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [msg] = await db
      .insert(messages)
      .values({
        senderId: user.id,
        receiverId,
        content: content || "",
        listingId: listingId || null,
        bookingId: bookingId || null,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt });

    return NextResponse.json({ message: msg });
  } catch (error) {
    logger.error("Send message error", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
