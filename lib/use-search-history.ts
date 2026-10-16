"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

function queryText(value: unknown): string | null {
  return typeof value === "string" ? value.trim().slice(0, 120) || null : null;
}

/** History is a private row-object response, never an unchecked string array. */
export function parseSearchHistory(value: unknown, userId: string): string[] | null {
  if (!value || typeof value !== "object" || !("userId" in value) || value.userId !== userId
    || !("searches" in value) || !Array.isArray(value.searches)) return null;
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const row of value.searches.slice(0, 100)) {
    const query = row && typeof row === "object" && "query" in row ? queryText(row.query) : null;
    if (!query || seen.has(query.toLowerCase())) continue;
    seen.add(query.toLowerCase()); queries.push(query);
    if (queries.length === 10) break;
  }
  return queries;
}

type Scope = { userId: string; active: boolean; revision: number; controllers: Set<AbortController>; pending: Promise<void> };

export function useSearchHistory() {
  const { user, loading } = useAuth();
  const userId = !loading && user ? user.id : null;
  const [stored, setStored] = useState<{ userId: string; queries: string[] } | null>(null);
  const scopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    if (!userId) return;
    const scope: Scope = { userId, active: true, revision: 0, controllers: new Set(), pending: Promise.resolve() };
    scopeRef.current = scope;
    const controller = new AbortController(); scope.controllers.add(controller);
    fetch(`/api/search-history?${new URLSearchParams({ expectedUserId: userId })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const queries = parseSearchHistory(await response.json(), userId);
        if (scope.active && scope.revision === 0 && !controller.signal.aborted && queries !== null) setStored({ userId, queries });
      }).catch(() => {}).finally(() => scope.controllers.delete(controller));
    return () => { scope.active = false; for (const request of scope.controllers) request.abort(); };
  }, [userId]);

  const mutate = useCallback((query: string | null): Promise<void> => {
    const scope = scopeRef.current;
    if (!userId || !scope?.active || scope.userId !== userId) return Promise.resolve();
    // Serialize writes so clearing then saving cannot reach the server in reverse order.
    scope.pending = scope.pending.then(async () => {
      if (!scope.active) return;
      const controller = new AbortController(); scope.controllers.add(controller);
      try {
        const response = await fetch(query === null
          ? `/api/search-history?${new URLSearchParams({ expectedUserId: userId })}` : "/api/search-history", {
          method: query === null ? "DELETE" : "POST", signal: controller.signal,
          ...(query === null ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, expectedUserId: userId }) }),
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (!scope.active || controller.signal.aborted || !result || typeof result !== "object" || !("userId" in result) || result.userId !== userId) return;
        // Only confirmed writes supersede a pending initial read; failed writes
        // must still allow that read to populate the account's existing history.
        scope.revision += 1;
        setStored(previous => ({ userId, queries: query === null ? []
          : [query, ...(previous?.userId === userId ? previous.queries : []).filter(item => item.toLowerCase() !== query.toLowerCase())].slice(0, 10) }));
      } catch { /* History failure must not interrupt search. */ }
      finally { scope.controllers.delete(controller); }
    });
    return scope.pending;
  }, [userId]);

  const saveSearchHistory = useCallback((value: string) => {
    const query = queryText(value);
    return query ? mutate(query) : Promise.resolve();
  }, [mutate]);
  const clearSearchHistory = useCallback(() => mutate(null), [mutate]);
  return { searchHistory: userId && stored?.userId === userId ? stored.queries : [], saveSearchHistory, clearSearchHistory };
}
