// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { consumePhoneCode, finishPhoneSend, reservePhoneCode, updatePhoneAwareProfile, type PhoneActor } from "@/server/phone-verification";

const enabled = process.env.VAKAYGO_PHONE_DB_TESTS === "true";
const id = randomUUID(), email = `phone-${id}@fixture.invalid`;
const actor: PhoneActor = { userId: id, role: "traveler", email, sessionVersion: 3 };
const oldPhone = "+14735550111", target = "+14735550222";
let db: NeonQueryFunction<false, false>;
async function pending() { const challenge = await reservePhoneCode(actor, target); await finishPhoneSend(actor, challenge.id, true); return challenge; }
async function snapshot() { return (await db`SELECT phone,phone_verified FROM users WHERE id=${id}::uuid`)[0]; }
describe.skipIf(!enabled)("personal phone challenges in owned PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "http://invalid");
    const local = url.hostname === "127.0.0.1" && url.port === "5498";
    const hosted = process.env.CI === "true" && process.env.VAKAYGO_CI_DATABASE_PROXY === "1" && ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5432";
    if ((!local && !hosted) || url.pathname !== "/vakaygo_test" || url.username !== "audit") throw new Error("Owned local or hosted disposable PostgreSQL required");
    db = neon(process.env.DATABASE_URL!);
    await db`INSERT INTO users(id,email,name,role,email_verified,session_version)VALUES(${id}::uuid,${email},'Synthetic phone fixture','traveler',true,3)`;
  });
  beforeEach(async () => {
    await db`DELETE FROM user_phone_challenges WHERE user_id=${id}::uuid`;
    await db`UPDATE users SET email=${email},role='traveler',email_verified=true,session_version=3,phone=${oldPhone},phone_verified=true WHERE id=${id}::uuid`;
  });
  afterAll(async () => { if (db) await db`DELETE FROM users WHERE id=${id}::uuid`; });

  it("survives a fresh module instance, stores only a digest, and exposes confirmed status", async () => {
    const challenge = await pending();
    const [stored] = await db`SELECT code_hash FROM user_phone_challenges WHERE user_id=${id}::uuid`;
    expect(stored.code_hash).toMatch(/^[a-f0-9]{64}$/); expect(stored.code_hash).not.toBe(challenge.code);
    vi.resetModules();
    const fresh = await import("@/server/phone-verification");
    expect(await fresh.consumePhoneCode(actor, challenge.code)).toEqual({ userId: id, phone: target, verified: true });
    expect(await fresh.phoneStatus(actor)).toEqual({ userId: id, phone: target, verified: true });
  });
  it("serializes starts and enforces durable cooldown plus five sends per hour", async () => {
    const starts = await Promise.allSettled([reservePhoneCode(actor, target), reservePhoneCode(actor, target)]);
    expect(starts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    for (let n = 1; n < 5; n++) {
      await db`UPDATE user_phone_challenges SET next_send_at=now()-interval '1 second' WHERE user_id=${id}::uuid`;
      await reservePhoneCode(actor, target);
    }
    await db`UPDATE user_phone_challenges SET next_send_at=now()-interval '1 second' WHERE user_id=${id}::uuid`;
    await expect(reservePhoneCode(actor, target)).rejects.toMatchObject({ status: 429 });
    expect((await db`SELECT send_count FROM user_phone_challenges WHERE user_id=${id}::uuid`)[0].send_count).toBe(5);
    await db`UPDATE user_phone_challenges SET send_window_started_at=now()-interval '2 hours' WHERE user_id=${id}::uuid`;
    await reservePhoneCode(actor, target);
  });
  it("commits all five wrong attempts across concurrent checks and closes the challenge", async () => {
    const challenge = await pending();
    const attempts = await Promise.allSettled(Array.from({ length: 7 }, () => consumePhoneCode(actor, "000000")));
    expect(attempts.every(r => r.status === "rejected")).toBe(true);
    const [stored] = await db`SELECT attempts,state,code_hash FROM user_phone_challenges WHERE user_id=${id}::uuid`;
    expect(stored).toEqual({ attempts: 5, state: "locked", code_hash: null });
    await expect(consumePhoneCode(actor, challenge.code)).rejects.toMatchObject({ status: 429 });
    expect(await snapshot()).toEqual({ phone: oldPhone, phone_verified: true });
  });
  it("consumes a valid code exactly once under concurrent requests", async () => {
    const challenge = await pending();
    const checks = await Promise.allSettled([consumePhoneCode(actor, challenge.code), consumePhoneCode(actor, challenge.code)]);
    expect(checks.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db`SELECT attempts,state,code_hash FROM user_phone_challenges WHERE user_id=${id}::uuid`)[0]).toEqual({ attempts: 1, state: "consumed", code_hash: null });
  });
  it("does not activate failed, superseded or expired sends", async () => {
    const old = await reservePhoneCode(actor, target);
    await finishPhoneSend(actor, old.id, false);
    await expect(consumePhoneCode(actor, old.code)).rejects.toMatchObject({ status: 400 });
    await db`UPDATE user_phone_challenges SET next_send_at=now()-interval '1 second' WHERE user_id=${id}::uuid`;
    const current = await reservePhoneCode(actor, target);
    await expect(finishPhoneSend(actor, old.id, true)).rejects.toMatchObject({ status: 409 });
    await expect(consumePhoneCode(actor, current.code)).rejects.toMatchObject({ status: 400 });
    await finishPhoneSend(actor, current.id, true);
    await db`UPDATE user_phone_challenges SET expires_at=now()-interval '1 second' WHERE user_id=${id}::uuid`;
    await expect(consumePhoneCode(actor, current.code)).rejects.toMatchObject({ status: 400 });
    expect(await snapshot()).toEqual({ phone: oldPhone, phone_verified: true });
  });
  it("checks the requested target and invalidates outstanding codes only on an actual profile phone change", async () => {
    const challenge = await pending();
    await expect(consumePhoneCode(actor, challenge.code, "+14735550333")).rejects.toMatchObject({ status: 400 });
    await updatePhoneAwareProfile(actor, { name: "Updated name", phone: oldPhone });
    expect((await snapshot()).phone_verified).toBe(true);
    expect((await db`SELECT state FROM user_phone_challenges WHERE user_id=${id}::uuid`)[0].state).toBe("pending");
    await updatePhoneAwareProfile(actor, { phone: "+14735550333" });
    expect((await snapshot()).phone_verified).toBe(false);
    expect((await db`SELECT state,code_hash FROM user_phone_challenges WHERE user_id=${id}::uuid`)[0]).toEqual({ state: "invalidated", code_hash: null });
    await updatePhoneAwareProfile(actor, { phone: oldPhone });
    await expect(consumePhoneCode(actor, challenge.code)).rejects.toMatchObject({ status: 400 });
  });
  it.each(["session", "email", "role"])("rejects a changed %s at mutation time", async change => {
    const challenge = await pending();
    if (change === "session") await db`UPDATE users SET session_version=4 WHERE id=${id}::uuid`;
    if (change === "email") await db`UPDATE users SET email='changed@fixture.invalid' WHERE id=${id}::uuid`;
    if (change === "role") await db`UPDATE users SET role='operator' WHERE id=${id}::uuid`;
    await expect(consumePhoneCode(actor, challenge.code)).rejects.toMatchObject({ status: 401 });
    expect((await db`SELECT state FROM user_phone_challenges WHERE user_id=${id}::uuid`)[0].state).toBe("pending");
  });
  it("takes a fresh identity snapshot after a real revocation lock wait", async () => {
    const challenge = await pending(), marker = 725016;
    const revocation = db.transaction(tx => [
      tx.query("UPDATE users SET session_version=4 WHERE id=$1::uuid", [id]),
      tx.query("SELECT pg_advisory_xact_lock($1)", [marker]),
      tx.query("SELECT pg_sleep(2)"),
    ], { isolationLevel: "ReadCommitted" });
    const deadline = Date.now() + 1500;
    let blocker = 0;
    while (Date.now() < deadline) {
      const rows = await db`SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=${marker}::oid AND granted`;
      if (rows.length) { blocker = Number(rows[0].pid); break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(blocker).not.toBe(0);
    const checking = consumePhoneCode(actor, challenge.code).then(() => null, error => error);
    let observedWait = false;
    while (Date.now() < deadline) {
      const rows = await db`SELECT pid FROM pg_stat_activity WHERE ${blocker}::int=ANY(pg_blocking_pids(pid))`;
      if (rows.length) { observedWait = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await revocation;
    expect(observedWait).toBe(true);
    expect(await checking).toMatchObject({ status: 401 });
    expect(await snapshot()).toEqual({ phone: oldPhone, phone_verified: true });
  }, 10000);
});
