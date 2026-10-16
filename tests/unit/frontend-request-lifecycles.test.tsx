import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ id: "operator-a", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: navigation.id }), useRouter: () => ({ push: navigation.push }) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/components/listings/listing-card", () => ({ ListingCard: () => null }));
import OperatorProfile from "@/app/(platform)/operator/[id]/page";
import { ReviewIntelligence } from "@/components/listings/review-intelligence";
import { MessageBadge } from "@/components/layout/message-badge";
import { NotificationBell } from "@/components/layout/notification-bell";
import { AiInsights } from "@/components/operator/ai-insights";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); navigation.id = "operator-a";
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(child: React.ReactNode) { await act(async () => root.render(child)); }
function deferred() { let resolve!: (value: Response) => void; return { promise: new Promise<Response>(accept => { resolve = accept; }), resolve: (value: Response) => resolve(value) }; }
const operator = (name: string) => Response.json({ operator: { id: name, name, businessName: name, businessDescription: null, avatarUrl: null, createdAt: "2026-01-01T12:00:00Z" }, listings: [], stats: { totalListings: 0, totalReviews: 0, avgRating: 0 } });
const intelligence = (summary: string) => Response.json({ summary, sentiment: "positive", sentimentScore: 1, highlights: [], concerns: [], bestFor: [], trendDirection: "stable", tipFromReviewers: "", keywordCloud: [] });

it("resets the profile on route changes and ignores an obsolete operator response", async () => {
  const first = deferred(), second = deferred(); fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(<OperatorProfile />); const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  navigation.id = "operator-b"; await render(<OperatorProfile />); expect(signal.aborted).toBe(true);
  await act(async () => second.resolve(operator("Current operator")));
  expect(container.textContent).toContain("Current operator");
  await act(async () => first.resolve(operator("Obsolete operator")));
  expect(container.textContent).not.toContain("Obsolete operator"); expect(container.textContent).toContain("Current operator");
});

it("keeps review intelligence tied to the current listing and review count", async () => {
  const first = deferred(), second = deferred(); fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(<ReviewIntelligence listingId="listing-a" reviewCount={3} />);
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  await render(<ReviewIntelligence listingId="listing-b" reviewCount={3} />); expect(signal.aborted).toBe(true);
  await act(async () => second.resolve(intelligence("Current analysis")));
  expect(container.textContent).toContain("Current analysis");
  await act(async () => first.resolve(intelligence("Obsolete analysis")));
  expect(container.textContent).not.toContain("Obsolete analysis");
  const refresh = deferred(); fetchMock.mockReturnValueOnce(refresh.promise);
  await render(<ReviewIntelligence listingId="listing-b" reviewCount={4} />);
  expect(container.textContent).not.toContain("Current analysis");
  await act(async () => refresh.resolve(intelligence("Updated analysis")));
  expect(container.textContent).toContain("Updated analysis");
  await render(<ReviewIntelligence listingId="listing-b" reviewCount={2} />); expect(container.textContent).toBe("");
});

it("polls message and notification counts immediately and on schedule, then cancels on unmount", async () => {
  vi.useFakeTimers(); let messages = 0, notifications = 0;
  fetchMock.mockImplementation(async (url: string) => url === "/api/messages"
    ? Response.json({ conversations: [{ unread: ++messages }] })
    : Response.json({ notifications: [], unreadCount: ++notifications }));
  await render(<><MessageBadge scrolled isLanding={false} /><NotificationBell scrolled isLanding={false} /></>);
  expect(container.querySelector('[aria-label="Messages (1 unread)"]')).not.toBeNull();
  expect(messages).toBe(1); expect(notifications).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(messages).toBe(3); expect(notifications).toBe(2);
  expect(container.querySelector('[aria-label="Messages (3 unread)"]')).not.toBeNull();
  const signals = fetchMock.mock.calls.map(call => call[1].signal as AbortSignal);
  await render(null); expect(signals.every(signal => signal.aborted)).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(messages).toBe(3); expect(notifications).toBe(2);
});

it("loads operator insights and retains an explicit refresh action", async () => {
  const first = deferred(); fetchMock.mockReturnValueOnce(first.promise);
  await render(<AiInsights />);
  const button = () => [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === "Refresh")!;
  expect(button().disabled).toBe(true);
  await act(async () => first.resolve(Response.json({ insights: ["Initial insight"] })));
  expect(container.textContent).toContain("Initial insight"); expect(button().disabled).toBe(false);
  fetchMock.mockResolvedValueOnce(Response.json({ insights: ["Updated insight"] }));
  await act(async () => button().click());
  expect(fetchMock.mock.calls[1][0]).toBe("/api/ai/operator-insights?refresh=1"); expect(container.textContent).toContain("Updated insight");
});
