// @vitest-environment node
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extendClaimedAvailability } from "@/server/listing-availability";

const enabled = process.env.VAKAYGO_AVAILABILITY_DB_TESTS === "true";
const listingId = "17000000-0000-4000-8000-000000000001";
const unclaimedId = "17000000-0000-4000-8000-000000000002";
const operatorId = "16000000-0000-4000-8000-000000000017";
let db: NeonQueryFunction<false, false>;

describe.skipIf(!enabled)("rolling availability against isolated PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    const local = url.hostname === "127.0.0.1" && url.port === "5498";
    const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1"
      && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
    if ((!local && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit") {
      throw new Error("Owned audit or hosted disposable PostgreSQL required");
    }
    db = neon(process.env.DATABASE_URL!);
    await db`INSERT INTO islands(id,slug,name,country) VALUES(995017,'rolling-availability-fixture','Rolling availability fixture','Grenada')`;
    await db`INSERT INTO users(id,email,role,email_verified) VALUES(${operatorId},'rolling-availability@example.invalid','operator',true)`;
    await db`INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy)
      VALUES(${listingId},${operatorId},995017,'tour','Rolling claimed fixture','rolling-claimed-fixture','active',50,'USD','person',4,'moderate'),
            (${unclaimedId},${operatorId},995017,'tour','Rolling unclaimed fixture','rolling-unclaimed-fixture','active',50,'USD','person',4,'moderate')`;
    await db`INSERT INTO listing_claims(id,listing_id,operator_id,status,contact_name,contact_phone)
      VALUES('30000000-0000-4000-8000-000000000017',${listingId},${operatorId},'approved','Synthetic owner','+14735550117')`;
    await db`INSERT INTO listing_claim_verifications(id,listing_id,operator_id,claim_id,target_phone,service_sid,provider_account_id,provider_verification_id,status,provider_approved_at,verified_at)
      VALUES('40000000-0000-4000-8000-000000000017',${listingId},${operatorId},'30000000-0000-4000-8000-000000000017','+14735550117','VA_rolling','AC_rolling','VE_rolling','verified',now(),now())`;
    await db`INSERT INTO listing_onboarding(listing_id,operator_id,verified_claim_id) VALUES(${listingId},${operatorId},'40000000-0000-4000-8000-000000000017')`;
    await db`INSERT INTO availability(listing_id,date,spots,spots_remaining,price_override,is_blocked)
      VALUES(${listingId},(current_date+1)::timestamp,4,4,null,false),(${listingId},(current_date+2)::timestamp,7,3,123.45,true)`;
    await db`DELETE FROM availability WHERE listing_id=${listingId} AND date::date=current_date+1`;
  });

  afterAll(async () => {
    if (!db) return;
    await db`DELETE FROM listings WHERE id IN (${listingId},${unclaimedId})`;
    await db`DELETE FROM users WHERE id=${operatorId}`;
    await db`DELETE FROM islands WHERE id=995017`;
  });

  it("extends only claimed tails and preserves every existing calendar choice", async () => {
    const first = await extendClaimedAvailability();
    expect(first.candidates).toBeGreaterThanOrEqual(1);
    expect(first.opened).toBeGreaterThanOrEqual(87);
    const rows = await db`SELECT date::date AS day,spots,spots_remaining,price_override,is_blocked FROM availability WHERE listing_id=${listingId} ORDER BY date`;
    expect(rows).toHaveLength(88);
    expect(rows[0].spots).toBe(7);
    expect(rows[0].spotsRemaining ?? rows[0].spots_remaining).toBe(3);
    expect(rows[0].priceOverride ?? rows[0].price_override).toBe("123.45");
    expect(rows[0].isBlocked ?? rows[0].is_blocked).toBe(true);
    expect(await db`SELECT 1 FROM availability WHERE listing_id=${listingId} AND date::date=current_date+1`).toEqual([]);
    expect(await db`SELECT spots FROM availability WHERE listing_id=${listingId} AND date::date=current_date+3`).toEqual([{ spots: 4 }]);
    expect(await db`SELECT 1 FROM availability WHERE listing_id=${listingId} AND date::date=current_date+89`).toHaveLength(1);
    expect(await db`SELECT 1 FROM availability WHERE listing_id=${listingId} AND date::date=current_date+90`).toEqual([]);
    expect(await db`SELECT 1 FROM availability WHERE listing_id=${unclaimedId}`).toEqual([]);
    await extendClaimedAvailability();
    expect(await db`SELECT count(*)::int AS count FROM availability WHERE listing_id=${listingId}`).toEqual([{ count: 88 }]);
  });
});
