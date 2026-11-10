import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { messages, users } from "@/drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { verifyCurrentSessionToken } from "@/server/session-validation";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import { messageCursorAtSql, messagesAfterCursorSql } from "@/server/message-stream";
import {
  advanceMessageCursor,
  isMessageCursor,
  messageCursorFromDate,
  MESSAGE_CURSOR_FIRST_ID,
  MESSAGE_CURSOR_TIMESTAMP_FORMAT,
  type MessageCursor,
} from "@/lib/message-cursor";
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

const BATCH_SIZE = 50;

/**
 * Where a new connection starts: the database's own clock at full precision,
 * so the first poll cannot miss or repeat a message because the app server's
 * clock differs. Falls back to the app clock when the read fails.
 */
async function startingCursor(db: { execute?: (query: ReturnType<typeof sql>) => PromiseLike<unknown> }): Promise<MessageCursor> {
  try {
    const result = await db.execute?.(sql`SELECT to_char(localtimestamp, ${MESSAGE_CURSOR_TIMESTAMP_FORMAT}) AS at`);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] } | undefined)?.rows;
    const at = Array.isArray(rows) ? (rows[0] as { at?: unknown } | undefined)?.at : undefined;
    const cursor = { at, id: MESSAGE_CURSOR_FIRST_ID };
    if (isMessageCursor(cursor)) return cursor;
  } catch {
    // Use the app clock below.
  }
  return messageCursorFromDate(new Date())!;
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
      let cursor = await startingCursor(db);
      let heartbeatCounter = 0;
      const reportedRead = new Set<string>();
      const POLL_INTERVAL = 3000; // 3 seconds
      const BACKLOG_INTERVAL = 250;
      const HEARTBEAT_INTERVAL = 5; // every 5 polls = 15 seconds
      const MAX_DURATION = 290_000; // just under 5 min
      const startTime = Date.now();

      while (!closed && Date.now() - startTime < MAX_DURATION) {
        let fullBatch = false;
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
              // Full-precision timestamp text for the cursor; see lib/message-cursor.ts.
              cursorAt: messageCursorAtSql,
              senderName: users.name,
              senderAvatar: users.avatarUrl,
            })
            .from(messages)
            .innerJoin(users, eq(messages.senderId, users.id))
            .where(
              and(
                eq(messages.receiverId, user.id),
                messagesAfterCursorSql(cursor)
              )
            )
            .orderBy(messages.createdAt, messages.id)
            .limit(BATCH_SIZE);

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

          for (const { cursorAt: _cursorAt, ...msg } of newMessages) {
            void _cursorAt;
            send("message", { type: "new_message", message: msg });
          }

          for (const msg of readMessages) {
            if (!reportedRead.has(msg.id)) { send("message", { type: "message_read", messageId: msg.id }); reportedRead.add(msg.id); }
          }

          // Strictly forward: the next poll starts after the last row delivered.
          cursor = advanceMessageCursor(cursor, newMessages);
          fullBatch = newMessages.length >= BATCH_SIZE;

          // Heartbeat
          heartbeatCounter++;
          if (heartbeatCounter >= HEARTBEAT_INTERVAL) {
            send("heartbeat", { timestamp: Date.now() });
            heartbeatCounter = 0;
          }
        } catch (err) {
          logger.error("SSE poll error", err);
        }

        // A full batch means more is waiting: fetch it soon, but never without a
        // pause. The cursor always moves past delivered rows, so this ends.
        await sleep(fullBatch ? BACKLOG_INTERVAL : POLL_INTERVAL);
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
