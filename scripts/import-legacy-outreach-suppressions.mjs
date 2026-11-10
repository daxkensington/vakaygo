/**
 * One-off: add the addresses that bounced, complained or were provider-suppressed in
 * the October 2026 per-listing invitation run (sent through Resend, before the
 * campaign ledger existed) to outreach_email_suppressions, so no later campaign
 * writes to them again.
 *
 *   DATABASE_URL=... RESEND_API_KEY=... node scripts/import-legacy-outreach-suppressions.mjs            # dry run
 *   DATABASE_URL=... RESEND_API_KEY=... node scripts/import-legacy-outreach-suppressions.mjs --apply    # write
 *
 * The dry run reads only. It prints counts and short hashes, never an address.
 * A suppression cannot be removed afterwards, so review the dry run first.
 * Opt-outs from that run are handled by migration 0020, not by this script.
 */
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const WINDOW_START = Date.parse("2026-10-15T00:00:00Z");
const WINDOW_END = Date.parse("2026-10-22T00:00:00Z");
const REASONS = { bounced: "bounce", complained: "complaint", suppressed: "provider_suppressed" };
const MAX_PAGES = 400;

const { DATABASE_URL, RESEND_API_KEY } = process.env;
if (!DATABASE_URL || !RESEND_API_KEY) {
  console.error("DATABASE_URL and RESEND_API_KEY are required.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shortHash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
/** The list reports "2026-10-16 22:05:01.123456+00"; make that a strict ISO instant. */
function parseProviderTime(value) {
  const text = String(value || "").trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})$/, "$1:00");
  return Date.parse(text);
}

// The addresses the legacy run wrote to, from its own send notes.
const noted = await sql.query(
  `SELECT DISTINCT lower(m[1]) AS recipient FROM business_outreach b,
     regexp_matches(b.notes,'Claim invitation emailed to ([^[:space:]]+)','g') m
    WHERE b.contacted_at IS NOT NULL OR b.status='do_not_contact'`
);
const legacy = new Set(noted.map((row) => row.recipient).filter((value) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(value)));
console.log(`Legacy invitation addresses on record: ${legacy.size}`);

async function page(after) {
  const query = new URLSearchParams({ limit: "100" });
  if (after) query.set("after", after);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.resend.com/emails?${query}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "User-Agent": "Mozilla/5.0 (compatible; VakayGoOps/1.0)" },
    });
    if (response.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!response.ok) throw new Error(`Resend list returned ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data) || typeof body.has_more !== "boolean") throw new Error("Unexpected Resend list shape");
    return body;
  }
  throw new Error("Resend list kept rate limiting");
}

// The list is newest first: walk back until the page is older than the legacy window.
const outcomes = new Map();
let after, pages = 0, scanned = 0, reachedWindowStart = false;
while (pages < MAX_PAGES) {
  const body = await page(after);
  pages++;
  for (const item of body.data) {
    scanned++;
    const created = parseProviderTime(item.created_at);
    if (!Number.isFinite(created)) throw new Error("Unreadable provider timestamp; nothing written.");
    if (created < WINDOW_START) { reachedWindowStart = true; continue; }
    if (created >= WINDOW_END) continue;
    if (!/@vakaygo\.com>?$/i.test(String(item.from || "").trim())) continue;
    const recipient = Array.isArray(item.to) && item.to.length === 1 ? normalize(item.to[0]) : "";
    const reason = REASONS[item.last_event];
    if (!recipient || !reason || !legacy.has(recipient)) continue;
    // A complaint outranks a bounce, which outranks a provider suppression.
    const rank = { complaint: 3, bounce: 2, provider_suppressed: 1 };
    const previous = outcomes.get(recipient);
    if (!previous || rank[reason] > rank[previous.reason]) outcomes.set(recipient, { reason, emailId: String(item.id) });
  }
  if (reachedWindowStart || !body.has_more || body.data.length === 0) break;
  after = body.data.at(-1).id;
  await sleep(600);
}
if (!reachedWindowStart) {
  console.error(`Stopped after ${pages} pages (${scanned} emails) without reaching ${new Date(WINDOW_START).toISOString()}; nothing written. The provider may no longer retain that period.`);
  process.exit(1);
}

const byReason = {};
for (const { reason } of outcomes.values()) byReason[reason] = (byReason[reason] || 0) + 1;
console.log(`Scanned ${scanned} provider emails in ${pages} pages. Legacy addresses with a bad outcome: ${outcomes.size}`, byReason);
for (const [recipient, { reason }] of outcomes) console.log(`  ${shortHash(recipient)}  ${reason}`);

if (!APPLY) {
  console.log("Dry run: nothing written. Re-run with --apply to add these suppressions.");
  process.exit(0);
}

let written = 0;
for (const [recipient, { reason, emailId }] of outcomes) {
  const rows = await sql.query(
    `INSERT INTO outreach_email_suppressions(recipient,reason,provider,source_event_id)
     VALUES($1,$2,'resend',$3) ON CONFLICT(recipient) DO NOTHING RETURNING recipient`,
    [recipient, reason, `legacy_resend_${emailId}`.slice(0, 256)]
  );
  written += rows.length;
}
console.log(`Suppressions written: ${written} (already present: ${outcomes.size - written}).`);
