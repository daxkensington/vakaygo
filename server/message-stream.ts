import { sql } from "drizzle-orm";
import { messages } from "@/drizzle/schema";
import { MESSAGE_CURSOR_TIMESTAMP_FORMAT, type MessageCursor } from "@/lib/message-cursor";

/** `messages.created_at` as text at full (microsecond) precision; becomes `MessageCursor.at`. */
export const messageCursorAtSql = sql<string>`to_char(${messages.createdAt}, ${MESSAGE_CURSOR_TIMESTAMP_FORMAT})`;

/**
 * Rows strictly after the cursor. A row-value comparison on (created_at, id):
 * the cursor's own row can never match again, and a second row with the same
 * timestamp is still delivered. See lib/message-cursor.ts for why a Date
 * cannot be the cursor.
 */
export function messagesAfterCursorSql(cursor: MessageCursor) {
  return sql`(${messages.createdAt}, ${messages.id}) > (${cursor.at}::timestamp, ${cursor.id}::uuid)`;
}
