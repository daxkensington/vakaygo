// @vitest-environment node
import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { tripSaveQuery, type TripDraftItem } from "@/server/trip-planner-persistence";
const enabled = process.env.VAKAYGO_DISCOVERY_DB_TESTS === "true";
const userId = randomUUID(), email = `trip-${userId}@fixture.invalid`;
const islandSlug = `trip-persistence-${userId}`;
const actor = { userId, email, role: "traveler", sessionVersion: 7, emailVerified: true };
let db: NeonQueryFunction<false, false>, islandId: number;
const item: TripDraftItem = { listingId: null, dayNumber: 1, timeSlot: "morning", customTitle: `Synthetic plan ${userId}`, customNote: "Meet family", sortOrder: 0 };
async function save(identity = actor, items = [item]) {
  const query = new PgDialect().sqlToQuery(tripSaveQuery(identity, { islandId, title: "Atomic synthetic plan", startDate: "2027-01-01", endDate: "2027-01-02", guestCount: 2, budget: null, interests: [], isAiGenerated: false }, items));
  return db.query(query.sql, query.params);
}
async function tripCount() { return Number((await db`SELECT count(*) AS count FROM trips WHERE user_id=${userId}::uuid`)[0].count); }
async function itemCount() { return Number((await db`SELECT count(*) AS count FROM trip_items WHERE custom_title=${item.customTitle}`)[0].count); }
async function cleanupOwnedTrips() {
  const owned = await db`SELECT id FROM trips WHERE user_id=${userId}::uuid`;
  if (owned.length) await db.query("DELETE FROM trips WHERE user_id=$1::uuid AND id=ANY($2::uuid[])", [userId, owned.map(row => row.id)]);
}
describe.skipIf(!enabled)("trip statement atomicity in owned PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    const owned = url.hostname === "127.0.0.1" && url.port === "5498";
    const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
    if ((!owned && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned local or hosted disposable PostgreSQL required");
    db = neon(process.env.DATABASE_URL!);
    await db`INSERT INTO users(id,email,name,role,session_version,email_verified) VALUES(${userId}::uuid,${email},'Synthetic trip fixture','traveler',7,true)`;
    const [island] = await db`INSERT INTO islands(slug,name,country,is_active)
      VALUES(${islandSlug},'Synthetic trip persistence destination','Synthetic fixture',true) RETURNING id`;
    islandId = island.id;
  });
  afterEach(async () => {
    if (!db) return;
    await cleanupOwnedTrips();
    await db`UPDATE users SET email=${email},role='traveler',session_version=7,email_verified=true WHERE id=${userId}::uuid`;
  });
  afterAll(async () => {
    if (!db) return;
    await cleanupOwnedTrips();
    await db`DELETE FROM users WHERE id=${userId}::uuid`;
    if (islandId !== undefined) await db`DELETE FROM islands WHERE id=${islandId} AND slug=${islandSlug}`;
  });
  it("commits the trip and all notes together with camelcase response fields", async () => {
    const rows = await save(actor, [item, { ...item, timeSlot: "evening", sortOrder: 1 }]);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ userId, islandId, title: "Atomic synthetic plan", isAiGenerated: false, isPublic: false });
    expect(await tripCount()).toBe(1);
    const notes = await db`SELECT custom_title,custom_note,time_slot,sort_order FROM trip_items WHERE trip_id=${rows[0].id}::uuid ORDER BY sort_order`;
    expect(notes).toEqual([
      { custom_title: item.customTitle, custom_note: item.customNote, time_slot: "morning", sort_order: 0 },
      { custom_title: item.customTitle, custom_note: item.customNote, time_slot: "evening", sort_order: 1 },
    ]);
    expect(await itemCount()).toBe(2);
  });
  it("rolls back the trip and valid sibling item when a later item fails its real listing foreign key", async () => {
    await expect(save(actor, [item, { ...item, listingId: randomUUID(), sortOrder: 1 }])).rejects.toMatchObject({ code: "23503" });
    expect(await tripCount()).toBe(0); expect(await itemCount()).toBe(0);
  });
  it.each([{ sessionVersion: 6 }, { role: "operator" }, { email: "changed@fixture.invalid" }, { emailVerified: false }])("saves nothing for a stale current actor: %j", async changed => {
    expect(await save({ ...actor, ...changed })).toEqual([]); expect(await tripCount()).toBe(0); expect(await itemCount()).toBe(0);
  });
  it("rejects an actor revoked in PostgreSQL after authentication while accepting the fresh epoch", async () => {
    await db`UPDATE users SET session_version=8 WHERE id=${userId}::uuid`;
    expect(await save(actor)).toEqual([]); expect(await tripCount()).toBe(0); expect(await itemCount()).toBe(0);
    expect(await save({ ...actor, sessionVersion: 8 })).toHaveLength(1);
    expect(await tripCount()).toBe(1); expect(await itemCount()).toBe(1);
  });
  it("can save a deliberately empty manual shell atomically", async () => {
    expect(await save(actor, [])).toHaveLength(1); expect(await tripCount()).toBe(1);
  });
});
