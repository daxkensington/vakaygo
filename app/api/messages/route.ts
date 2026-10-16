import { NextResponse } from "next/server";
import { messages, users, listings, bookings } from "@/drizzle/schema";
import { eq, or, and, desc, inArray, sql } from "drizzle-orm";
import { requireUser } from "@/server/admin-auth";
import { createDb } from "@/server/db";
import { isMessageId, parseMessageInput, containsOffPlatformContact } from "@/lib/message-input";
import { logger } from "@/lib/logger";

const pair = (userId: string, partnerId: string) => or(
  and(eq(messages.senderId, userId), eq(messages.receiverId, partnerId)),
  and(eq(messages.senderId, partnerId), eq(messages.receiverId, userId)),
);
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });
const CONTACT_SHIELD_MESSAGE =
  "For your protection under the VakayGo Guarantee, phone numbers, email addresses, external links, and off-platform apps (such as WhatsApp) cannot be shared before a booking is confirmed and paid.";

export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const params = new URL(request.url).searchParams;
    const partnerId = params.get("with"), listingId = params.get("listingId");
    if ((partnerId !== null && (!isMessageId(partnerId) || partnerId === auth.userId)) || (listingId !== null && (!isMessageId(listingId) || !partnerId))) return failure("A valid conversation is required", 400);
    const db = createDb();
    if (partnerId) {
      const conditions = [pair(auth.userId, partnerId)];
      if (listingId) conditions.push(eq(messages.listingId, listingId));
      const rows = await db.select({ id: messages.id, content: messages.content, senderId: messages.senderId, receiverId: messages.receiverId,
        listingId: messages.listingId, attachmentUrl: messages.attachmentUrl, attachmentType: messages.attachmentType,
        isRead: messages.isRead, createdAt: messages.createdAt, senderName: users.name, senderAvatar: users.avatarUrl })
        .from(messages).innerJoin(users, eq(messages.senderId, users.id)).where(and(...conditions)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(100);
      return NextResponse.json({ messages: rows.reverse() });
    }
    // One chronological query across both directions, so a newer reply wins.
    const rows = await db.select({ id: messages.id, senderId: messages.senderId, receiverId: messages.receiverId, content: messages.content,
      createdAt: messages.createdAt, listingId: messages.listingId, isRead: messages.isRead })
      .from(messages).where(or(eq(messages.senderId, auth.userId), eq(messages.receiverId, auth.userId))).orderBy(desc(messages.createdAt), desc(messages.id));
    const conversations = new Map<string, { userId: string; lastMessage: string; lastDate: string; unread: number; listingId: string | null }>();
    for (const row of rows) {
      const userId = row.senderId === auth.userId ? row.receiverId : row.senderId;
      if (!conversations.has(userId)) conversations.set(userId, { userId, lastMessage: row.content || "Attachment", lastDate: row.createdAt.toISOString(), unread: 0, listingId: row.listingId });
      if (row.receiverId === auth.userId && !row.isRead) conversations.get(userId)!.unread++;
    }
    const result = await Promise.all([...conversations.values()].map(async conversation => {
      const [user] = await db.select({ name: users.name, businessName: users.businessName }).from(users).where(eq(users.id, conversation.userId)).limit(1);
      return { ...conversation, name: user?.businessName || user?.name || "User" };
    }));
    return NextResponse.json({ conversations: result });
  } catch (error) { logger.error("Messages error", error); return failure("Messages could not be loaded. Please try again.", 500); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    if (!auth.emailVerified) return failure("Verify your email before sending a message.", 403);
    const input = parseMessageInput(await request.json().catch(() => null));
    if (!input || input.receiverId === auth.userId) return failure("Provide a valid recipient and a message of up to 2000 characters.", 400);
    const hasBlockedContact = auth.role !== "admin" && containsOffPlatformContact(input.content);
    if (hasBlockedContact && !input.bookingId) {
      return failure(CONTACT_SHIELD_MESSAGE, 422);
    }
    const db = createDb();
    const { clientMessageId, ...values } = input;
    const replay = async () => {
      if (!clientMessageId) return null;
      const [saved] = await db.select().from(messages).where(and(eq(messages.id, clientMessageId), eq(messages.senderId, auth.userId))).limit(1);
      if (!saved) return null;
      return Object.entries(values).some(([key, value]) => saved[key as keyof typeof saved] !== value)
        ? failure("This send attempt cannot be reused for a different message.", 409)
        : NextResponse.json({ message: { id: saved.id, createdAt: saved.createdAt } });
    };
    // An acknowledged own receipt remains truthful if ownership changed after a
    // committed send whose HTTP response was lost. Replays never create a message.
    const receipt = await replay();
    if (receipt) return receipt;
    const [recipient] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.receiverId)).limit(1);
    if (!recipient) return failure("This recipient is unavailable.", 404);
    const existingPair = async (listingId?: string) => {
      const conditions = [pair(auth.userId, input.receiverId)];
      if (listingId) conditions.push(eq(messages.listingId, listingId));
      return (await db.select({ id: messages.id }).from(messages).where(and(...conditions)).limit(1)).length > 0;
    };
    if (input.bookingId) {
      const [booking] = await db.select({ travelerId: bookings.travelerId, operatorId: bookings.operatorId, listingId: bookings.listingId, status: bookings.status, paidAt: bookings.paidAt }).from(bookings).where(eq(bookings.id, input.bookingId)).limit(1);
      if (!booking || ![booking.travelerId, booking.operatorId].includes(auth.userId) || input.receiverId !== (auth.userId === booking.travelerId ? booking.operatorId : booking.travelerId) || (input.listingId && input.listingId !== booking.listingId)) return failure("This booking is not part of your conversation.", 403);
      if (hasBlockedContact && !((booking.status === "confirmed" || booking.status === "completed") && Boolean(booking.paidAt))) {
        return failure(CONTACT_SHIELD_MESSAGE, 422);
      }
    } else if (input.listingId) {
      const [listing] = await db.select({ operatorId: listings.operatorId, status: listings.status, claimVerified: sql<boolean>`vakaygo_listing_claim_verified(${listings.id})` }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
      if (!listing || (auth.userId === listing.operatorId ? !await existingPair(input.listingId) : input.receiverId !== listing.operatorId || listing.status !== "active" || !listing.claimVerified)) return failure("This business is unavailable for messages. Check its current contact details.", 409);
    } else if (auth.role !== "admin" && !await existingPair()) return failure("Start a conversation from the business listing.", 403);
    // These subqueries are evaluated by PostgreSQL at the actual write. A
    // changed proof epoch or listing owner yields NULL and the existing NOT NULL
    // constraints reject the insert atomically, without a schema change.
    const sender = sql<string>`(select id from users where id=${auth.userId}::uuid and session_version=${auth.sessionVersion} and email_verified=true)`;
    const receiver = input.listingId && !input.bookingId
      ? sql<string>`(select ${users.id} from ${users} where ${users.id}=${input.receiverId}::uuid and exists (select 1 from ${listings} where ${listings.id}=${input.listingId}::uuid and ((${listings.operatorId}=${auth.userId}::uuid) or (${listings.operatorId}=${input.receiverId}::uuid and ${listings.status}='active' and vakaygo_listing_claim_verified(${listings.id})))))`
      : input.receiverId;
    const [saved] = await db.insert(messages).values({ ...values, senderId: sender, receiverId: receiver, ...(clientMessageId ? { id: clientMessageId } : {}) })
      .onConflictDoNothing({ target: messages.id }).returning({ id: messages.id, createdAt: messages.createdAt });
    if (saved) return NextResponse.json({ message: saved });
    return await replay() || failure("This send attempt cannot be reused for a different message.", 409);
  } catch (error) {
    const dbError = error as { code?: string; cause?: { code?: string } };
    if (dbError.code === "23502" || dbError.cause?.code === "23502") return failure("The account or business changed. Refresh this page before sending.", 409);
    logger.error("Send message error", error); return failure("Your message could not be sent. Please try again.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const body = await request.json().catch(() => null);
    if (!body || !isMessageId(body.with) || !Array.isArray(body.messageIds) || body.messageIds.length > 100 || !body.messageIds.length || !body.messageIds.every(isMessageId)) return failure("A valid conversation and delivered messages are required.", 400);
    const read = await createDb().update(messages).set({ isRead: true }).where(and(
      eq(messages.receiverId, auth.userId), eq(messages.senderId, body.with), inArray(messages.id, body.messageIds),
    )).returning({ id: messages.id });
    return NextResponse.json({ readIds: read.map(row => row.id) });
  } catch (error) { logger.error("Read messages error", error); return failure("Messages could not be marked as read.", 500); }
}
