/**
 * Position in a recipient's message stream.
 *
 * `messages.created_at` is a Postgres timestamp with microseconds; a JavaScript
 * Date keeps milliseconds. A cursor held as a Date is therefore always slightly
 * EARLIER than the row it came from, so "created_at > cursor" matched that same
 * row again on every poll and the newest message was re-sent every 3 seconds.
 *
 * The cursor keeps the database's own text for the timestamp, at full
 * precision, plus the row id as a tie-breaker. The stream asks for rows where
 * (created_at, id) > (cursor.at, cursor.id), which can never return the row the
 * cursor points at and never skips a row that shares its timestamp.
 */
export type MessageCursor = { at: string; id: string };

/** to_char() format producing `MessageCursor.at`; fixed width, so string order is time order. */
export const MESSAGE_CURSOR_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US';

/** Sorts before every real uuid. */
export const MESSAGE_CURSOR_FIRST_ID = "00000000-0000-0000-0000-000000000000";

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMessageCursor(value: unknown): value is MessageCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as { at?: unknown; id?: unknown };
  return typeof cursor.at === "string" && CURSOR_AT.test(cursor.at) && typeof cursor.id === "string" && UUID.test(cursor.id);
}

/**
 * A cursor from a JavaScript clock reading (UTC, like the column). `micros` fills
 * the three digits a Date cannot hold: "000" for a starting point, "999" when the
 * Date was read back from a row and the cursor must not fall before that row.
 */
export function messageCursorFromDate(date: Date, micros: "000" | "999" = "000", id: string = MESSAGE_CURSOR_FIRST_ID): MessageCursor | null {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString(); // 2026-11-10T08:00:00.123Z
  return { at: `${iso.slice(0, 23)}${micros}`, id };
}

function compare(a: MessageCursor, b: MessageCursor): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  const left = a.id.toLowerCase();
  const right = b.id.toLowerCase();
  return left === right ? 0 : left < right ? -1 : 1;
}

type CursorRow = { id?: unknown; cursorAt?: unknown; createdAt?: unknown };

function cursorOfRow(row: CursorRow): MessageCursor | null {
  const id = typeof row.id === "string" && UUID.test(row.id) ? row.id : null;
  if (typeof row.cursorAt === "string" && CURSOR_AT.test(row.cursorAt)) return { at: row.cursorAt, id: id ?? MESSAGE_CURSOR_FIRST_ID };
  // No database text for the timestamp: round the Date UP to the end of its
  // millisecond so the cursor cannot land before the row it was read from.
  const date = row.createdAt instanceof Date ? row.createdAt : typeof row.createdAt === "string" ? new Date(row.createdAt) : null;
  if (!date) return null;
  return messageCursorFromDate(date, "999", "ffffffff-ffff-ffff-ffff-ffffffffffff");
}

/**
 * The cursor after delivering `rows`: the furthest row seen, and never earlier
 * than the current cursor. Rows that cannot be placed leave it where it is.
 */
export function advanceMessageCursor(current: MessageCursor, rows: readonly CursorRow[]): MessageCursor {
  let next = current;
  for (const row of rows) {
    const candidate = cursorOfRow(row);
    if (candidate && compare(candidate, next) > 0) next = candidate;
  }
  return next;
}
