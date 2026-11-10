import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DESTINATION_ESSENTIALS } from "@/lib/destination-facts";
import { BUSINESS_MAILING_ADDRESS, OPERATING_BUSINESS } from "@/lib/brand";

const root = process.cwd();
const llms = readFileSync(join(root, "public", "llms.txt"), "utf8");
const urls = Array.from(new Set(llms.match(/https:\/\/vakaygo\.com[^\s)]*/g) ?? []));
const slugs = Object.keys(DESTINATION_ESSENTIALS);

/** True when the path is a page this app serves. */
function routeExists(pathname: string): boolean {
  if (pathname === "" || pathname === "/") return existsSync(join(root, "app", "page.tsx"));
  const segments = pathname.replace(/^\//, "").split("/");
  if (segments.length !== 1) return false;
  const [segment] = segments;
  // Destination hub, and the three SEO hubs that next.config.ts rewrites.
  if (slugs.includes(segment)) return true;
  for (const prefix of ["things-to-do-in-", "best-hotels-", "best-restaurants-"]) {
    if (segment.startsWith(prefix)) return slugs.includes(segment.slice(prefix.length));
  }
  return ["(platform)", "(marketing)", ""].some((group) =>
    existsSync(join(root, "app", group, segment, "page.tsx")),
  );
}

describe("public/llms.txt", () => {
  it("links only to pages that exist", () => {
    expect(urls.length).toBeGreaterThan(100);
    const broken = urls.filter((url) => {
      const { pathname, search } = new URL(url);
      return search !== "" || !routeExists(pathname);
    });
    expect(broken).toEqual([]);
  });

  it("does not link the removed or private paths", () => {
    for (const path of ["/stays", "/tours", "/destinations/", "/operator", "/admin", "/api/"]) {
      expect(urls.some((url) => new URL(url).pathname.startsWith(path))).toBe(false);
    }
  });

  it("lists every destination with its four pages", () => {
    for (const slug of slugs) {
      for (const path of [`/${slug}`, `/things-to-do-in-${slug}`, `/best-hotels-${slug}`, `/best-restaurants-${slug}`]) {
        expect(urls, path).toContain(`https://vakaygo.com${path}`);
      }
    }
  });

  it("describes the service as it is: a directory where only set-up listings take bookings", () => {
    expect(llms).toContain("34 destinations");
    expect(llms).toContain(
      "Online booking is available only on listings whose business has claimed the listing and completed setup",
    );
    expect(llms).toContain(`${OPERATING_BUSINESS}, ${BUSINESS_MAILING_ADDRESS}`);
  });

  it("makes none of the old false claims", () => {
    expect(llms).not.toMatch(/Direct Booking Platform/i);
    expect(llms).not.toMatch(/\bverified\b/i);
    expect(llms).not.toMatch(/Headquarters/i);
    expect(llms).not.toMatch(/direct customer communication/i);
    expect(llms).not.toMatch(/generally safe|is safe|safe destination/i);
  });
});
