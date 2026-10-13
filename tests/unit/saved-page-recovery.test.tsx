import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const a = "41000000-0000-4000-8000-000000000001", b = "41000000-0000-4000-8000-000000000002";
const id = "42000000-0000-4000-8000-000000000001", c1 = "43000000-0000-4000-8000-000000000001", c2 = "43000000-0000-4000-8000-000000000002";
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/layout/header", () => ({ Header: () => null })); vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ format: (amount: number) => String(amount) }) }));
vi.mock("@/components/shared/image-fallback", () => ({ ImageWithFallback: ({ src, alt }: { src: string | null; alt: string }) => React.createElement("img", { src: src || undefined, alt }) }));
import SavedPage from "@/app/(platform)/saved/page";
import { SavedProvider } from "@/lib/use-saved";
let root: Root, container: HTMLDivElement, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const listing = (title = "Private A", collectionIds = [c1]) => ({ id, title, slug: "synthetic", type: "tour", collectionIds, islandSlug: "audit-island", islandName: "Audit Island", avgRating: "4.50", reviewCount: 5, reviewSource: "google", image: "https://images.unsplash.com/synthetic-public-image" });
function deferred() { let resolve!: (body: unknown) => void; return { promise: new Promise<unknown>(accept => { resolve = accept; }), resolve: (body: unknown) => resolve(body) }; }
const collections = [{ id: c1, name: "Beach", itemCount: 1 }, { id: c2, name: "Food", itemCount: 0 }];
async function render() { await act(async () => root.render(<SavedProvider><SavedPage /></SavedProvider>)); }
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === text || item.getAttribute("aria-label") === text)!;
async function click(text: string) { expect(button(text), text).toBeDefined(); await act(async () => button(text).click()); }
function reads(title = "Private A", memberships = [c1]) {
  fetchMock.mockImplementation(async (url: string) => url.startsWith("/api/saved?") ? response({ userId: auth.user!.id, saved: [listing(title, memberships)] }) : response({ userId: auth.user!.id, collections }));
}
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id: a }; auth.loading = false;
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("renders persisted multiple memberships and the API itemCount contract", async () => {
  reads("Private A", [c1,c2]); await render(); expect(button("Beach(1)")).toBeDefined(); await click("Food(0)");
  expect(container.textContent).toContain("Private A");
});
it("keeps load failure distinct from empty saved and recovers with retry", async () => {
  fetchMock.mockResolvedValue(response({ error: "Unavailable" }, 503)); await render();
  expect(container.textContent).not.toContain("No saved listings yet"); expect(container.textContent).toContain("could not be loaded");
  reads(); await click("Try loading saved listings again"); expect(container.textContent).toContain("Private A");
});
it("failed removal keeps the card and only a confirmed retry removes it and updates counts", async () => {
  reads(); await render(); fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 503));
  await click("Remove from saved"); expect(container.textContent).toContain("Private A"); expect(container.textContent).toContain("Removal could not be confirmed");
  fetchMock.mockResolvedValueOnce(response({ userId: a, listingId: id, removed: true })); await click("Remove from saved");
  expect(container.textContent).not.toContain("Private A"); expect(button("Beach(0)")).toBeDefined();
});
it("the actual saved-page card has one confirmed removal control and preserves public imagery/review provenance", async () => {
  reads(); await render(); fetchMock.mockResolvedValueOnce(response({ userId: a, listingId: id, removed: true }));
  expect(container.querySelector('button[aria-label="Unsave listing"]')).toBeNull(); expect(container.querySelector('button[aria-label="Save listing"]')).toBeNull();
  expect(container.textContent).toContain("5 Google"); expect(container.querySelector('img[alt="Private A"]')?.getAttribute("src")).toContain("synthetic-public-image");
  await click("Remove from saved"); expect(container.textContent).not.toContain("Private A");
});
it("failed move keeps persisted membership and retries the explicit atomic move with current identity", async () => {
  reads(); await render(); await click("Move to collection"); fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 503));
  await click("Food"); await click("Beach(1)"); expect(container.textContent).toContain("Private A");
  fetchMock.mockResolvedValueOnce(response({ userId: a, listingId: id, moved: true, collectionIds: [c2] }));
  await click("Food"); expect(container.textContent).not.toContain("Private A"); expect(button("Food(1)")).toBeDefined(); await click("Food(1)");
  expect(container.textContent).toContain("Private A");
  const writes = fetchMock.mock.calls.filter(call => call[0] === "/api/wishlist-collections/move");
  expect(writes).toHaveLength(2); expect(JSON.parse(writes[1][1].body)).toEqual({ expectedUserId: a, listingId: id, collectionId: c2 });
});
it("retains a failed collection draft and allows a confirmed retry", async () => {
  reads(); await render(); await click("New Collection"); const input = container.querySelector('input[aria-label="Collection name"]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "My plans"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 503)); await click("Create collection"); expect(input.value).toBe("My plans");
  fetchMock.mockResolvedValueOnce(response({ userId: a, collection: { id: "43000000-0000-4000-8000-000000000003", name: "My plans", itemCount: 0 } }));
  await click("Create collection"); expect(button("My plans(0)")).toBeDefined();
});
it("hides loaded A data while B loads and rejects late A reads after a later B success", async () => {
  const old = deferred(), next = deferred(); reads(); await render();
  fetchMock.mockImplementation((url: string) => {
    const owner = new URL(url, "https://vakaygo.com").searchParams.get("expectedUserId");
    const hold = owner === a ? old : next;
    return hold.promise.then(body => response(url.startsWith("/api/saved?") ? { userId: owner, saved: [listing(String(body))] } : { userId: owner, collections }));
  });
  await click("Reload saved listings");
  auth.user = { id: b }; await render(); expect(container.textContent).not.toContain("Private A");
  await act(async () => next.resolve("Private B")); expect(container.textContent).toContain("Private B");
  await act(async () => old.resolve("Obsolete A")); expect(container.textContent).not.toContain("Obsolete A");
});
it("late A collection creation cannot modify B collections", async () => {
  const creation = deferred(); reads(); await render(); await click("New Collection"); const input = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "A private plans"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  fetchMock.mockImplementationOnce(() => creation.promise.then(body => response(body))); await click("Create collection");
  auth.user = { id: b }; reads("Private B"); await render();
  await act(async () => creation.resolve({ userId: a, collection: { id: c1, name: "A private plans", itemCount: 0 } }));
  expect(container.textContent).toContain("Private B"); expect(container.textContent).not.toContain("A private plans");
});
