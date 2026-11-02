import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages, users } from "@/drizzle/schema";
import { eq, and, or, gt, asc, desc } from "drizzle-orm";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
export const maxDuration = 300; // 5 minutes

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  try {
    const session = await verifyCurrentSessionToken(token);
    return session ? { id: session.userId, token } : null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      // Send initial connection event
      send("connected", { userId: user.id, timestamp: Date.now() });

      const db = drizzle(neon(process.env.DATABASE_URL!));
      const startupCutoff = new Date();
      let cursor: { createdAt: Date; id: string } | null = null;
      let heartbeatCounter = 0;
      const reportedRead = new Set<string>();
      const POLL_INTERVAL = 3000; // 3 seconds
      const HEARTBEAT_INTERVAL = 5; // every 5 polls = 15 seconds
      const MAX_DURATION = 290_000; // just under 5 min
      const startTime = Date.now();

      while (!closed && Date.now() - startTime < MAX_DURATION) {
        try {
          // Check for new messages
          const newMessages = await db
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
            .where(
              and(
                eq(messages.receiverId, user.id),
                cursor
                  ? or(
                      gt(messages.createdAt, cursor.createdAt),
                      and(
                        eq(messages.createdAt, cursor.createdAt),
                        gt(messages.id, cursor.id)
                      )
                    )
                  : gt(messages.createdAt, startupCutoff)
              )
            )
            .orderBy(asc(messages.createdAt), asc(messages.id))
            .limit(50);

          // Read receipts include older inquiries opened by their recipient today.
          const readMessages = await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.senderId, user.id),
                eq(messages.isRead, true),
              )
            )
            .orderBy(desc(messages.createdAt), desc(messages.id))
            .limit(100);

          // An open stream must not outlive revocation or first email proof.
          if (!await verifyCurrentSessionToken(user.token)) {
            closed = true;
            controller.close();
            break;
          }

          for (const msg of newMessages) {
            send("message", { type: "new_message", message: msg });
            if (closed) break;
            cursor = { createdAt: msg.createdAt, id: msg.id };
          }

          for (const msg of readMessages) {
            if (!reportedRead.has(msg.id)) { send("message", { type: "message_read", messageId: msg.id }); reportedRead.add(msg.id); }
          }

          // Heartbeat
          heartbeatCounter++;
          if (heartbeatCounter >= HEARTBEAT_INTERVAL) {
            send("heartbeat", { timestamp: Date.now() });
            heartbeatCounter = 0;
          }

          // Drain full batches before waiting, including timestamp ties.
          if (newMessages.length === 50) continue;
        } catch (err) {
          logger.error("SSE poll error", err);
        }

        await sleep(POLL_INTERVAL);
      }

      // Stream ending
      if (!closed) {
        send("reconnect", { reason: "timeout" });
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
