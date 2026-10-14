import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { isMessageId } from "@/lib/message-input";

import { logger } from "@/lib/logger";

// Volatile in-memory typing state: key = "senderId:receiverId", value = expiry timestamp
const typingState = new Map<string, number>();

// Clean expired entries periodically
function cleanExpired() {
  const now = Date.now();
  for (const [key, expiry] of typingState) {
    if (expiry < now) typingState.delete(key);
  }
}

/**
 * POST — Set typing indicator for current user toward a receiver
 * Body: { receiverId: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    if (!auth.emailVerified) return NextResponse.json({ error: "Verify your email before messaging." }, { status: 403 });
    const senderId = auth.userId;
    const { receiverId } = await request.json().catch(() => ({}));
    if (!isMessageId(receiverId) || receiverId === senderId) {
      return NextResponse.json({ error: "receiverId required" }, { status: 400 });
    }

    // Store typing state with 5-second expiry
    const key = `${senderId}:${receiverId}`;
    cleanExpired();
    if (typingState.size >= 5000 && !typingState.has(key)) return NextResponse.json({ error: "Typing is temporarily unavailable." }, { status: 503 });
    typingState.set(key, Date.now() + 5000);

    // Lazy cleanup
    cleanExpired();

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Typing POST error", error);
    return NextResponse.json({ error: "Failed to set typing state" }, { status: 500 });
  }
}

/**
 * GET — Check if someone is typing to the current user
 * Query: ?senderId=xxx
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.error;
    const receiverId = auth.userId;

    const { searchParams } = new URL(request.url);
    const senderId = searchParams.get("senderId") || searchParams.get("conversationWith");

    if (!isMessageId(senderId) || senderId === receiverId) {
      return NextResponse.json({ error: "senderId required" }, { status: 400 });
    }

    const key = `${senderId}:${receiverId}`;
    const expiry = typingState.get(key);
    const isTyping = expiry !== undefined && expiry > Date.now();

    // Clean up if expired
    if (expiry !== undefined && expiry <= Date.now()) {
      typingState.delete(key);
    }

    return NextResponse.json({ isTyping });
  } catch (error) {
    logger.error("Typing GET error", error);
    return NextResponse.json({ error: "Failed to check typing state" }, { status: 500 });
  }
}
