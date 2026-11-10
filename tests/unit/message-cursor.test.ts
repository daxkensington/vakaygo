// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  advanceMessageCursor, isMessageCursor, messageCursorFromDate,
  MESSAGE_CURSOR_FIRST_ID, MESSAGE_CURSOR_TIMESTAMP_FORMAT, type MessageCursor,
} from "@/lib/message-cursor";
import { messageCursorAtSql, messagesAfterCursorSql } from "@/server/message-stream";

const A = "40000000-0000-4000-8000-00000000000a";
const B = "40000000-0000-4000-8000-00000000000b";
const start: MessageCursor = { at: "2026-11-10T08:00:00.000000", id: MESSAGE_CURSOR_FIRST_ID };

describe("message stream cursor", () => {
  it("keeps the database's microseconds, which a JavaScript Date drops", () => {
    // The row was stored at .123456; drizzle hands back a Date at .123.
    const row = { id: A, cursorAt: "2026-11-10T08:00:01.123456", createdAt: new Date("2026-11-10T08:00:01.123Z") };
    const next = advanceMessageCursor(start, [row]);
    expect(next).toEqual({ at: "2026-11-10T08:00:01.123456", id: A });
    // The old cursor was the Date: earlier than the row, so the row matched "created_at > cursor" on every poll.
    expect(messageCursorFromDate(row.createdAt)!.at < row.cursorAt).toBe(true);
    // The new cursor is the row itself, which a strict row comparison can never return again.
    expect(next.at === row.cursorAt && next.id === row.id).toBe(true);
  });

  it("moves to the furthest row, breaks timestamp ties on id, and never moves backwards", () => {
    const sameInstant = "2026-11-10T08:00:02.000001";
    const rows = [{ id: B, cursorAt: sameInstant }, { id: A, cursorAt: sameInstant }, { id: A, cursorAt: "2026-11-10T08:00:01.999999" }];
    const next = advanceMessageCursor(start, rows);
    expect(next).toEqual({ at: sameInstant, id: B });
    expect(advanceMessageCursor(next, [{ id: A, cursorAt: "2026-11-10T08:00:00.500000" }])).toBe(next);
    expect(advanceMessageCursor(next, [])).toBe(next);
    expect(advanceMessageCursor(next, [{ id: "not-a-uuid", cursorAt: "garbage" }])).toBe(next);
  });

  it("falls back to the end of the row's millisecond when the database text is missing", () => {
    const next = advanceMessageCursor(start, [{ id: A, createdAt: new Date("2026-11-10T08:00:03.250Z") }]);
    expect(next.at).toBe("2026-11-10T08:00:03.250999");
    expect(isMessageCursor(next)).toBe(true);
  });

  it("validates cursors and builds a starting point from a clock reading", () => {
    expect(messageCursorFromDate(new Date("2026-11-10T08:00:00.007Z"))).toEqual({ at: "2026-11-10T08:00:00.007000", id: MESSAGE_CURSOR_FIRST_ID });
    expect(messageCursorFromDate(new Date("nope"))).toBeNull();
    expect(isMessageCursor(start)).toBe(true);
    expect(isMessageCursor({ at: "2026-11-10T08:00:00.000Z", id: A })).toBe(false);
    expect(isMessageCursor({ at: start.at, id: "x" })).toBe(false);
    expect(isMessageCursor(null)).toBe(false);
  });

  it("asks the database for rows strictly after (created_at, id) at full precision", () => {
    const cursor = { at: "2026-11-10T08:00:01.123456", id: A };
    const where = new PgDialect().sqlToQuery(messagesAfterCursorSql(cursor));
    expect(where.sql.replace(/\s+/g, " ")).toBe('("messages"."created_at", "messages"."id") > ($1::timestamp, $2::uuid)');
    expect(where.params).toEqual([cursor.at, A]);
    const select = new PgDialect().sqlToQuery(messageCursorAtSql);
    expect(select.sql).toContain('to_char("messages"."created_at"');
    expect(select.params).toEqual([MESSAGE_CURSOR_TIMESTAMP_FORMAT]);
    expect(MESSAGE_CURSOR_TIMESTAMP_FORMAT).toContain(".US");
  });
});
