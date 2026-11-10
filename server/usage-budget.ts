import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { SESSION_SECRET } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/rate-limit";
import {
  USAGE_BUDGETS, exceededBudget, secondsUntilUtcMidnight,
  type BudgetCounts, type BudgetFeature, type BudgetScope,
} from "@/lib/usage-budget-policy";

/**
 * Durable daily budgets for paid provider calls (policy and reasons in
 * lib/usage-budget-policy.ts). One statement adds this call to the site-wide
 * row and to the caller's row for today and returns both totals, so the
 * count is atomic and shared by every server instance.
 *
 * The counters live in `usage_budget_counters` (migration 0021). A git
 * deploy applies no migration, so until that table exists the same limits
 * are enforced from this instance's memory: weaker, but never open-ended.
 * Any other database failure refuses the call, because an unmetered paid
 * call is the thing this exists to prevent.
 */

export type BudgetCaller = { ip: string; userId?: string | null };

export type BudgetDecision =
  | { allowed: true; durable: boolean }
  | { allowed: false; scope: BudgetScope | "unavailable"; retryAfter: number; durable: boolean };

type Row = { globalCalls: number | string; globalUnits: number | string; callerCalls: number | string | null; callerUnits: number | string | null };
type Query = (text: string, params: unknown[]) => Promise<unknown>;

const COUNT_SQL = `WITH site AS (
  INSERT INTO usage_budget_counters(day,feature,bucket,calls,units)
  VALUES ((now() AT TIME ZONE 'utc')::date,$1,'*',1,$3)
  ON CONFLICT (day,feature,bucket) DO UPDATE
    SET calls=usage_budget_counters.calls+1,units=usage_budget_counters.units+excluded.units,updated_at=now()
  RETURNING calls,units
), caller AS (
  -- No per-caller row once the site ceiling is spent: a caller rotating
  -- addresses must not be able to grow this table without bound.
  INSERT INTO usage_budget_counters(day,feature,bucket,calls,units)
  SELECT (now() AT TIME ZONE 'utc')::date,$1,$2,1,$3 FROM site
  WHERE site.calls<=$4 AND ($5::int IS NULL OR site.units<=$5)
  ON CONFLICT (day,feature,bucket) DO UPDATE
    SET calls=usage_budget_counters.calls+1,units=usage_budget_counters.units+excluded.units,updated_at=now()
  RETURNING calls,units
) SELECT site.calls AS "globalCalls",site.units AS "globalUnits",
    (SELECT calls FROM caller) AS "callerCalls",(SELECT units FROM caller) AS "callerUnits" FROM site`;

/** A caller is an account when signed in, otherwise a keyed hash of the address (the address itself is not stored). */
export function budgetBucket(caller: BudgetCaller): string {
  if (caller.userId) return `user:${caller.userId}`;
  const digest = createHmac("sha256", SESSION_SECRET()).update(`vakaygo-usage-budget-v1:${caller.ip || "unknown"}`).digest("hex");
  return `ip:${digest.slice(0, 32)}`;
}

// ─── In-memory fallback (table not created yet) ───────────────────

const memory = new Map<string, { calls: number; units: number }>();
let memoryDay = "";

function memoryCount(feature: BudgetFeature, bucket: string, units: number, now: Date): BudgetCounts {
  const day = now.toISOString().slice(0, 10);
  if (day !== memoryDay) { memory.clear(); memoryDay = day; }
  const add = (key: string) => {
    const entry = memory.get(key) ?? { calls: 0, units: 0 };
    entry.calls += 1; entry.units += units;
    memory.set(key, entry);
    return entry;
  };
  const site = add(`${feature}:*`);
  // Same rule as the SQL: stop creating caller entries once the site ceiling is spent.
  const budget = USAGE_BUDGETS[feature];
  const spent = site.calls > budget.globalCalls || (budget.globalUnits !== undefined && site.units > budget.globalUnits);
  const caller = spent ? { calls: 0, units: 0 } : add(`${feature}:${bucket}`);
  return { globalCalls: site.calls, globalUnits: site.units, callerCalls: caller.calls, callerUnits: caller.units };
}

/** Tests only. */
export function resetUsageBudgetMemory() { memory.clear(); memoryDay = ""; tableMissingUntil = 0; }

let tableMissingUntil = 0;
const TABLE_RECHECK_MS = 60_000;

function isUndefinedTable(error: unknown): boolean {
  const failure = error as { code?: string; cause?: { code?: string }; message?: string };
  return (failure?.code ?? failure?.cause?.code) === "42P01" || /relation "usage_budget_counters" does not exist/i.test(String(failure?.message || ""));
}

/**
 * Add one call (and `units`, e.g. characters) to today's totals and say
 * whether it fits. Call it immediately before the paid provider request.
 */
export async function consumeUsageBudget(
  feature: BudgetFeature,
  caller: BudgetCaller,
  units = 0,
  options: { now?: Date; query?: Query } = {},
): Promise<BudgetDecision> {
  const now = options.now ?? new Date();
  const budget = USAGE_BUDGETS[feature];
  const bucket = budgetBucket(caller);
  const signedIn = !!caller.userId;
  const safeUnits = Number.isFinite(units) && units > 0 ? Math.min(Math.floor(units), 1_000_000) : 0;
  const decide = (counts: BudgetCounts, durable: boolean): BudgetDecision => {
    const scope = exceededBudget(feature, counts, signedIn);
    return scope ? { allowed: false, scope, retryAfter: secondsUntilUtcMidnight(now), durable } : { allowed: true, durable };
  };

  if (now.getTime() >= tableMissingUntil) {
    try {
      const query: Query = options.query ?? ((text, params) => neon(process.env.DATABASE_URL!).query(text, params));
      const result = await query(COUNT_SQL, [feature, bucket, safeUnits, budget.globalCalls, budget.globalUnits ?? null]);
      const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows;
      const row = (Array.isArray(rows) ? rows[0] : undefined) as Row | undefined;
      if (!row) throw new Error("usage budget returned no row");
      const globalCalls = Number(row.globalCalls), globalUnits = Number(row.globalUnits);
      // No caller row means the site ceiling was already spent before this call.
      const callerCalls = row.callerCalls === null ? 0 : Number(row.callerCalls);
      const callerUnits = row.callerUnits === null ? 0 : Number(row.callerUnits);
      if (![globalCalls, globalUnits, callerCalls, callerUnits].every(Number.isFinite)) throw new Error("usage budget returned invalid counts");
      return decide({ globalCalls, globalUnits, callerCalls, callerUnits }, true);
    } catch (error) {
      if (!isUndefinedTable(error)) {
        logger.error("Usage budget unavailable", error, { feature });
        return { allowed: false, scope: "unavailable", retryAfter: 60, durable: false };
      }
      tableMissingUntil = now.getTime() + TABLE_RECHECK_MS;
    }
  }
  return decide(memoryCount(feature, bucket, safeUnits, now), false);
}

/** The caller of a request: the platform's client address, plus the account when the route knows it. */
export function budgetCaller(request: Request, userId?: string | null): BudgetCaller {
  return { ip: getClientIp(request.headers), userId: userId ?? null };
}

const MESSAGES: Record<BudgetFeature, { caller: string; global: string }> = {
  concierge: {
    caller: "You have reached today's limit for concierge messages. It starts again tomorrow; you can keep browsing listings in the meantime.",
    global: "The concierge has reached its limit for today. It will be back tomorrow; you can keep browsing listings in the meantime.",
  },
  smart_search: {
    caller: "You have reached today's limit for AI search. Standard search still works.",
    global: "AI search has reached its limit for today. Standard search still works.",
  },
  search_summary: {
    caller: "You have reached today's limit for AI search summaries.",
    global: "AI search summaries have reached their limit for today.",
  },
  tts: {
    caller: "You have reached today's limit for spoken replies. Text replies still work.",
    global: "Spoken replies have reached their limit for today. Text replies still work.",
  },
  phone_sms: {
    caller: "You have reached today's limit for verification texts. Please try again tomorrow.",
    global: "Phone verification is unavailable for the rest of today. Please try again tomorrow.",
  },
};

/** The JSON response for a refused call: 429 for a spent budget, 503 when the meter itself is down. */
export function budgetRefusal(feature: BudgetFeature, decision: Extract<BudgetDecision, { allowed: false }>): NextResponse {
  const headers = { "Retry-After": String(decision.retryAfter), "Cache-Control": "no-store" };
  if (decision.scope === "unavailable") {
    return NextResponse.json({ error: "This feature is temporarily unavailable. Please try again shortly.", code: "USAGE_BUDGET_UNAVAILABLE" }, { status: 503, headers });
  }
  return NextResponse.json(
    { error: MESSAGES[feature][decision.scope], code: "USAGE_BUDGET_EXHAUSTED", scope: decision.scope, retryAfter: decision.retryAfter },
    { status: 429, headers },
  );
}
