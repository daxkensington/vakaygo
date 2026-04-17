import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("renders hero and primary nav", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/VakayGo/);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("explore page lists islands", async ({ page }) => {
    await page.goto("/explore");
    // Wait for either listings or the "no results" empty state
    await expect(page.locator("body")).toContainText(/island|Island|stay|tour/i, {
      timeout: 15_000,
    });
  });

  test("robots.txt disallows admin and api", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/api/);
    expect(body).toMatch(/Disallow:\s*\/admin/);
  });
});
