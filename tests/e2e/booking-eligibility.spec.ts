import { test, expect } from "@playwright/test";

// The existing CI tour fixture deliberately supports paid-booking API tests.
// A current public eligibility response must still close stale/cached listing UI.
for (const reason of ["unclaimed", "onboarding_incomplete", "suspended"]) {
  test(`directory and direct booking pages expose no booking controls when ${reason}`, async ({ page }) => {
    await page.route("**/api/listings/eligibility?*", route => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ eligible: false, reason }),
    }));
    await page.goto("/audit-island/audit-tour");
    await expect(page.getByRole("heading", { name: "Audit tour", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Booking availability" })).toContainText("Information only");
    await expect(page.getByRole("button", { name: /^(Book Now|Request to Book|Reserve a Table|Request a Table|Pay Now|Continue & Book)$/ })).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.getByText("Instant Book", { exact: true })).toHaveCount(0);
    await expect.poll(async () => {
      const text = await page.locator("#listing-jsonld").textContent();
      return text ? JSON.parse(text).offers : undefined;
    }).toBeUndefined();

    await page.goto("/audit-island/audit-tour/book");
    await expect(page.getByRole("heading", { name: "Audit tour", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Booking availability" })).toContainText("Information only");
    await expect(page.locator('input[type="date"], input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /book|reserve|pay/i })).toHaveCount(0);
  });
}

test("a restored direct booking page remains informational while platform setup is incomplete", async ({ page, request }) => {
  // CI intentionally leaves bookings disabled; do not synthesize a positive
  // provider response here. Positive-to-revoked widget behavior has unit coverage.
  const eligibility = await request.get("/api/listings/eligibility?listingId=20000000-0000-4000-8000-000000000001");
  expect(eligibility.status()).toBe(200);
  expect(await eligibility.json()).toEqual({ eligible: false, reason: "payments_unavailable" });
  await page.goto("/audit-island/audit-tour/book");
  await expect(page.getByRole("complementary", { name: "Booking availability" })).toContainText("Information only");
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.getByRole("complementary", { name: "Booking availability" })).toContainText("Information only");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /book|reserve|pay/i })).toHaveCount(0);
});
