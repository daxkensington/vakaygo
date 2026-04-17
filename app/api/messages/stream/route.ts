import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages, users } from "@/drizzle/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
export const maxDuration = 300; // 5 minutes

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
      let lastChecked = new Date();
      let heartbeatCounter = 0;
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
                gt(messages.createdAt, lastChecked)
              )
            )
            .orderBy(messages.createdAt)
            .limit(50);

          for (const msg of newMessages) {
            send("message", { type: "new_message", message: msg });
          }

          // Check for messages that were recently marked as read (sent by current user)
          const readMessages = await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.senderId, user.id),
                eq(messages.isRead, true),
                gt(messages.createdAt, new Date(Date.now() - 30000)) // last 30s
              )
            )
            .limit(50);

          for (const msg of readMessages) {
            send("message", { type: "message_read", messageId: msg.id });
          }

          if (newMessages.length > 0) {
            lastChecked = new Date(
              Math.max(
                ...newMessages.map((m) => new Date(m.createdAt).getTime())
              )
            );
          } else {
            lastChecked = new Date();
          }

          // Heartbeat
          heartbeatCounter++;
          if (heartbeatCounter >= HEARTBEAT_INTERVAL) {
            send("heartbeat", { timestamp: Date.now() });
            heartbeatCounter = 0;
          }
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
