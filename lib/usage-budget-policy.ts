/**
 * Daily budgets for the things that cost money per call and that a visitor
 * can trigger: the concierge (Claude), AI search (Grok), text-to-speech
 * (OpenAI, billed per character) and phone-verification texts (Twilio).
 *
 * The per-IP token bucket in lib/rate-limit.ts lives in one server instance's
 * memory, so it resets on every cold start and a caller who rotates addresses
 * gets a fresh bucket each time. These budgets are counted in Postgres
 * (server/usage-budget.ts), shared by every instance:
 *
 *  - `perCaller*` bounds one visitor (a signed-in account, or one address);
 *  - `global*` is the ceiling for the whole site for one UTC day. It is what
 *    actually caps spend, because accounts and addresses are cheap to mint.
 *
 * Sized against real traffic (about 30 people a day in November 2026) with
 * room for 20 times that; raise them when real demand gets close.
 */
export type BudgetFeature = "concierge" | "smart_search" | "search_summary" | "tts" | "phone_sms";

export interface FeatureBudget {
  /** Calls per UTC day for one anonymous address. */
  perCallerCalls: number;
  /** Calls per UTC day for one signed-in account. */
  perAccountCalls: number;
  /** Units per UTC day for one caller (characters for text-to-speech); omitted when calls are the only measure. */
  perCallerUnits?: number;
  /** Calls per UTC day for the whole site. */
  globalCalls: number;
  /** Units per UTC day for the whole site. */
  globalUnits?: number;
}

export const USAGE_BUDGETS: Readonly<Record<BudgetFeature, FeatureBudget>> = {
  // One request can run several model turns with tools.
  concierge: { perCallerCalls: 30, perAccountCalls: 80, globalCalls: 600 },
  smart_search: { perCallerCalls: 80, perAccountCalls: 80, globalCalls: 3000 },
  search_summary: { perCallerCalls: 120, perAccountCalls: 120, globalCalls: 4000 },
  // Up to 2,000 characters a call; 400,000 characters is about US$6 of tts-1.
  tts: { perCallerCalls: 40, perAccountCalls: 40, perCallerUnits: 40_000, globalCalls: 400, globalUnits: 400_000 },
  // A code is one text. The account limit of five an hour stays in server/phone-verification.ts.
  phone_sms: { perCallerCalls: 10, perAccountCalls: 6, globalCalls: 150 },
};

export type BudgetScope = "caller" | "global";

export interface BudgetCounts {
  callerCalls: number;
  callerUnits: number;
  globalCalls: number;
  globalUnits: number;
}

/**
 * Which limit, if any, the counts (taken AFTER this call was added) exceed.
 * The site-wide ceiling is reported first: when it is spent, nobody can call.
 */
export function exceededBudget(feature: BudgetFeature, counts: BudgetCounts, signedIn: boolean): BudgetScope | null {
  const budget = USAGE_BUDGETS[feature];
  if (counts.globalCalls > budget.globalCalls) return "global";
  if (budget.globalUnits !== undefined && counts.globalUnits > budget.globalUnits) return "global";
  if (counts.callerCalls > (signedIn ? budget.perAccountCalls : budget.perCallerCalls)) return "caller";
  if (budget.perCallerUnits !== undefined && counts.callerUnits > budget.perCallerUnits) return "caller";
  return null;
}

/** Seconds until the next UTC day, when every budget starts again. */
export function secondsUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}
