import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ router: { replace: vi.fn(), push: vi.fn() }, listingId: "20000000-0000-4000-8000-000000000001" }));
vi.mock("next/navigation", () => ({ useRouter: () => state.router, useParams: () => ({ listingId: state.listingId }), usePathname: () => "/operator/listings" }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { name: "Synthetic owner" }, signOut: vi.fn() }) }));
vi.mock("@/components/operator/photo-uploader", () => ({ default: () => null }));
vi.mock("@/components/operator/ai-description-button", () => ({ AIDescriptionButton: () => null }));
vi.mock("@/components/operator/ai-insights", () => ({ AiInsights: () => null }));
import EditListingPage from "@/app/operator/listings/[listingId]/page";
import ListingsPage from "@/app/operator/listings/page";
import OperatorDashboard from "@/app/operator/page";
import DashboardShell from "@/app/operator/dashboard-shell";

let container: HTMLDivElement, root: Root, fetchMock: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const listing = { id: state.listingId, title: "Synthetic draft", slug: "synthetic-draft", type: "tour", status: "draft", description: "Original description", headline: "Original headline", address: "Synthetic address", parish: "Synthetic area", priceAmount: "42.50", priceUnit: "person", typeData: { included: ["Water"], excluded: ["Lunch"], meetingPoint: "Synthetic meeting point" }, images: [], islandSlug: "synthetic", islandName: "Synthetic island" };
const stats = { totalRevenue: 20, bookingsThisMonth: 3, totalBookings: 8, avgRating: 0, totalReviews: 0, activeListings: 1, pendingBookings: 2, unreadMessages: 0, monthlyRevenue: [], recentBookings: [] };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const render = async (component: React.ReactNode) => { await act(async () => root.render(component)); };
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === label)!;
async function input(id: string, value: string) { const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)!; await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("loads draft editing data by owner UUID and does not offer unsupported public or publication actions", async () => {
  fetchMock.mockResolvedValue(response({ listing })); await render(<EditListingPage />);
  expect(fetchMock).toHaveBeenCalledWith(`/api/operator/listings/${listing.id}`, expect.objectContaining({ cache: "no-store" }));
  expect(container.querySelector<HTMLInputElement>("#edit-title")?.value).toBe(listing.title);
  expect(container.querySelector<HTMLInputElement>("#edit-price")?.value).toBe("42.50");
  expect(container.querySelector(`a[href="/synthetic/${listing.slug}"]`)).toBeNull();
  expect(Array.from(container.querySelectorAll("button")).some(item => item.textContent === "active")).toBe(false);
  expect(button("Submit for review")).toBeDefined();
});
it("retains edits on save failure and explicitly clears optional text and tour fields on retry", async () => {
  fetchMock.mockResolvedValueOnce(response({ listing })).mockResolvedValueOnce(response({ error: "Owner or publication status changed" }, 409)).mockResolvedValueOnce(response({ ok: true }));
  await render(<EditListingPage />); await input("edit-title", "Owner's revised title");
  for (const field of ["description", "headline", "address", "parish", "meetingPoint"]) await input(`edit-${field}`, "");
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Remove included item: Water"]')!.click(); container.querySelector<HTMLButtonElement>('[aria-label="Remove excluded item: Lunch"]')!.click(); });
  await submit(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("status changed");
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/listings/${listing.id}/update`);
  expect(container.querySelector<HTMLInputElement>("#edit-title")?.value).toBe("Owner's revised title"); expect(container.textContent).not.toContain("Saved!");
  await submit(); const body = JSON.parse(fetchMock.mock.calls[2][1].body);
  expect(body).toMatchObject({ title: "Owner's revised title", description: "", headline: "", address: "", parish: "", typeData: { included: [], excluded: [], meetingPoint: "" } });
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.textContent).toContain("Saved!");
});
it("allows failed private listing reads to retry without inventing a listing", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "Listing temporarily unavailable" }, 503)).mockResolvedValueOnce(response({ listing }));
  await render(<EditListingPage />); expect(container.querySelector("form")).toBeNull(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("temporarily unavailable");
  await act(async () => button("Try loading again").click()); expect(container.querySelector<HTMLInputElement>("#edit-title")?.value).toBe(listing.title);
});
it("keeps editable fields disabled while the captured save is in flight", async () => {
  let finish!: (value: Response) => void; fetchMock.mockResolvedValueOnce(response({ listing })).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  await render(<EditListingPage />); await submit(); expect(container.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finish(response({ error: "Please retry" }, 503))); expect(container.querySelector("fieldset")?.disabled).toBe(false);
});
it("distinguishes a listings fetch failure from an empty business and recovers both draft and active actions", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 503)).mockResolvedValueOnce(response({ listings: [listing, { ...listing, id: "active-id", status: "active", title: "Synthetic active", slug: "synthetic-active" }] }));
  await render(<ListingsPage />); expect(container.textContent).not.toContain("No listings yet"); expect(container.textContent).not.toContain("0 listings");
  await act(async () => button("Try loading again").click());
  expect(container.querySelector('[aria-label="View Synthetic draft"]')).toBeNull(); expect(container.querySelector('[aria-label="Edit Synthetic draft"]')).not.toBeNull(); expect(container.querySelector('[aria-label="View Synthetic active"]')).not.toBeNull();
});
it("shows unavailable statistics as an error, then labels the total as all-time bookings", async () => {
  fetchMock.mockResolvedValueOnce(response({ error: "Unavailable" }, 503)).mockResolvedValueOnce(response(stats));
  await render(<OperatorDashboard />); expect(container.querySelector('[role="alert"]')).not.toBeNull(); expect(container.textContent).not.toContain("No bookings yet"); expect(container.textContent).not.toContain("$0.00");
  await act(async () => button("Try loading again").click()); expect(container.textContent).toContain("8 all-time bookings"); expect(container.textContent).not.toContain("8 completed bookings");
});
it("connects each getting-started action to an owner route without a publication deadline promise", async () => {
  fetchMock.mockResolvedValue(response({ ...stats, activeListings: 0 })); await render(<OperatorDashboard />);
  expect(container.querySelector('a[href="#"]')).toBeNull(); expect(container.textContent).not.toContain("24 hours"); expect(container.querySelector('a[href="/operator/listings"]')).not.toBeNull();
});
it("names mobile navigation controls and restores trigger focus and body scrolling on Escape", async () => {
  const priorOverflow = document.body.style.overflow; await render(<DashboardShell><p>Owner content</p></DashboardShell>);
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open business navigation"]')!;
  await act(async () => trigger.click()); expect(trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(container.querySelector('[aria-label="Close business navigation"]')); expect(document.body.style.overflow).toBe("hidden");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(trigger); expect(document.body.style.overflow).toBe(priorOverflow);
  expect(container.querySelector('a[href="/operator/listings"][aria-current="page"]')).not.toBeNull();
});
