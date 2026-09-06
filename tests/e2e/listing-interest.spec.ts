import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";
const listingId = "20000000-0000-4000-8000-000000000001";
async function session(role = "traveler") {
  const id = role === "admin" ? "10000000-0000-4000-8000-000000000009" : role === "traveler" ? "10000000-0000-4000-8000-000000000002" : "10000000-0000-4000-8000-000000000001";
  return new SignJWT({ id, role, email: "audit-" + role + "@example.invalid", sessionVersion: 0 }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
test("claim finder resolves a real listing and keeps its claim identifier", async ({ page, request }) => {
  await page.goto("/for-businesses");
  await expect(page).toHaveTitle("Claim Your Caribbean Business Listing | VakayGo");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Claim it");
  await page.getByRole("textbox", { name: "Business name" }).fill("Audit directory cafe");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: "Claim this listing", exact: true })).toHaveAttribute("href", "/auth/signup?role=operator&claim=20000000-0000-4000-8000-000000000009");
  const wildcard = await request.get("/api/listings/claim-search?q=%25%25");
  expect((await wildcard.json()).listings).toHaveLength(0);
});

test("admin outreach shows aggregate demand, preserves concurrent edits and honors suppression", async ({ page, request, baseURL }) => {
  const id = "20000000-0000-4000-8000-000000000009";
  const customer = { Origin: baseURL!, Cookie: "session=" + await session() };
  const admin = { Origin: baseURL!, Cookie: "session=" + await session("admin") };
  const interested = { listingId: id, interested: true, noticeVersion: "2026-09-06" };
  expect((await request.post("/api/listings/interest", { headers: customer, data: interested })).status()).toBe(200);
  const queue = await request.get("/api/admin/outreach", { headers: admin });
  expect(queue.status()).toBe(200);
  const item = (await queue.json()).items.find((row: { id: string }) => row.id === id);
  expect(item.interestedCustomers).toBe(1);
  expect(item.draft).toContain("/audit-island/audit-directory-cafe");
  expect(JSON.stringify(item)).not.toMatch(/audit-traveler|user_id|userId/);
  const review = { listingId: id, status: "reviewing", notes: "Review official contact first", expectedUpdatedAt: item.updatedAt };
  await page.context().addCookies([{ name: "session", value: await session("admin"), url: baseURL! }]);
  await page.goto("/admin/outreach");
  const card = page.getByRole("article").filter({ hasText: "Audit directory cafe" });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole("combobox", { name: "Status", exact: true }).selectOption("reviewing");
  await card.getByLabel("Review and contact notes").fill(review.notes);
  await card.getByRole("button", { name: "Save review" }).click();
  await expect(card).toHaveCount(0);
  expect((await request.patch("/api/admin/outreach", { headers: admin, data: review })).status()).toBe(409);
  const refreshed = await request.get("/api/admin/outreach?status=reviewing", { headers: admin });
  const edited = (await refreshed.json()).items.find((row: { id: string }) => row.id === id);
  const suppressed = await request.patch("/api/admin/outreach", { headers: admin, data: { ...review, status: "do_not_contact", notes: "Synthetic opt-out", expectedUpdatedAt: edited.updatedAt } });
  expect(suppressed.status()).toBe(200);
  await request.post("/api/listings/interest", { headers: customer, data: { ...interested, interested: false } });
  await request.post("/api/listings/interest", { headers: customer, data: interested });
  const suppressedQueue = await request.get("/api/admin/outreach?status=do_not_contact", { headers: admin });
  const stopped = (await suppressedQueue.json()).items.find((row: { id: string }) => row.id === id);
  expect(stopped.draft).toBeNull(); expect(stopped.interestedCustomers).toBe(1);
  expect((await request.patch("/api/admin/outreach", { headers: admin, data: { ...review, expectedUpdatedAt: stopped.updatedAt } })).status()).toBe(409);
  await request.post("/api/listings/interest", { headers: customer, data: { ...interested, interested: false } });
});
test("raw listing HTML contains factual structured data and information-only interest", async ({ request }) => {
  const response = await request.get("/audit-island/audit-tour");
  expect(response.status()).toBe(200);
  const html = await response.text();
  const match = html.match(/<script[^>]*id="listing-jsonld"[^>]*>([\s\S]*?)<\/script>/);
  expect(match).toBeTruthy();
  const schema = JSON.parse(match![1]);
  expect(schema["@graph"][0].name).toBe("Audit tour");
  expect(JSON.stringify(schema)).not.toMatch(/"offers"|"aggregateRating"|InStock/);
  expect(html).toContain("Interested in this business?");
  expect(html).toContain("does not reserve anything");
});
test("interest rejects guests, cross-origin writes and operator self-interest", async ({ request, baseURL }) => {
  const data = { listingId, interested: true, noticeVersion: "2026-09-06" };
  const guest = await request.post("/api/listings/interest", { headers: { Origin: baseURL! }, data });
  expect(guest.status()).toBe(401);
  const csrf = await request.post("/api/listings/interest", { headers: { Origin: "https://unrelated.invalid", Cookie: "session=" + await session() }, data });
  expect(csrf.status()).toBe(403);
  const self = await request.post("/api/listings/interest", { headers: { Origin: baseURL!, Cookie: "session=" + await session("operator") }, data });
  expect(self.status()).toBe(403);
});
test("a traveler can record, reload and withdraw interest, but cannot read outreach", async ({ request, baseURL }) => {
  const headers = { Origin: baseURL!, Cookie: "session=" + await session() };
  const data = { listingId, interested: true, noticeVersion: "2026-09-06" };
  for (let n = 0; n < 2; n++) {
    const saved = await request.post("/api/listings/interest", { headers, data });
    expect(saved.status()).toBe(200); expect((await saved.json()).interested).toBe(true);
  }
  const read = await request.get("/api/listings/interest?listingId=" + listingId, { headers });
  expect(await read.json()).toEqual({ interested: true });
  const outreach = await request.get("/api/admin/outreach", { headers });
  expect(outreach.status()).toBe(403);
  const withdrawn = await request.post("/api/listings/interest", { headers, data: { ...data, interested: false } });
  expect(withdrawn.status()).toBe(200); expect((await withdrawn.json()).interested).toBe(false);
});
