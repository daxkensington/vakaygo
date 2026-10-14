import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/listings/review-intelligence", () => ({ ReviewIntelligence: () => null }));
vi.mock("@/components/reviews/review-photo-gallery", () => ({ ReviewPhotoGallery: () => null }));
import { ReviewSection } from "@/components/listings/review-section";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const review = (title: string) => ({ id: title, title, rating: 5, comment: null, operatorReply: null, createdAt: "2026-01-01", travelerName: "Traveler", travelerAvatar: null });
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { auth.user = null; vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(id = "a") { await act(async () => root.render(<ReviewSection listingId={id} listingTitle="Synthetic listing" />)); }
it("routes guests and members to eligible bookings instead of an empty booking review form", async () => {
  fetchMock.mockResolvedValue(response({ reviews: [] })); await render();
  expect(container.querySelector('a[href="/auth/signin?next=%2Fbookings"]')?.textContent).toContain("Review a completed booking");
  auth.user = { id: "owner" }; await render(); expect(container.querySelector('a[href="/bookings"]')).not.toBeNull();
  expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain("No VakayGo reviews yet");
});
it.each([response({ error: "unavailable" }, 503), response({ reviews: null })])("shows a retry for failed reads instead of an empty-review claim", async failed => {
  fetchMock.mockResolvedValueOnce(failed).mockResolvedValueOnce(response({ reviews: [review("Recovered review")] })); await render();
  expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("No VakayGo reviews yet");
  await act(async () => [...container.querySelectorAll("button")].find(value => value.textContent === "Try loading reviews again")!.click());
  expect(container.textContent).toContain("Recovered review"); expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("clears old listing reviews and rejects a late read after navigation", async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>(accept => { resolve = accept; })).mockResolvedValueOnce(response({ reviews: [review("B review")] }));
  await render(); const signal = fetchMock.mock.calls[0][1].signal; await render("b");
  await act(async () => resolve(response({ reviews: [review("Old A review")] })));
  expect(signal.aborted).toBe(true); expect(container.textContent).toContain("B review"); expect(container.textContent).not.toContain("Old A review");
});
