import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { budgetCaller, budgetRefusal, consumeUsageBudget } from "@/server/usage-budget";
import { SMART_SEARCH_SYSTEM_PROMPT, parseSearchCompletion, renderAiSearchResponse, validateAiSearchFilters, withAiSearchDeadline } from "@/server/ai-search-response";
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const rawQuery = body?.query;

    if (typeof rawQuery !== "string" || !rawQuery.trim()) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    // This endpoint is public. Input is bounded here, and the paid call below
    // is counted against a durable daily budget shared by every instance
    // (lib/usage-budget-policy.ts); the per-IP 'ai' rate limit only smooths bursts.
    const query = rawQuery.trim().slice(0, 400);
    const budget = await consumeUsageBudget("smart_search", budgetCaller(request));
    if (!budget.allowed) return budgetRefusal("smart_search", budget);

    const systemPrompt = SMART_SEARCH_SYSTEM_PROMPT;

    return await withAiSearchDeadline(request.signal, async signal => {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "grok-3-mini",
          max_tokens: 500,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
        }),
      });

      if (!res.ok) {
        logger.error("Grok search parsing error", null, { status: res.status });
        return NextResponse.json(
          { error: "AI search parsing failed" },
          { status: 502 }
        );
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const filters = validateAiSearchFilters(parseSearchCompletion(content), query);
      return NextResponse.json(renderAiSearchResponse(filters));
    });
  } catch (error) {
    logger.error("Smart search error", error);
    return NextResponse.json(
      { error: "Failed to parse search query" },
      { status: 500 }
    );
  }
}
