import { describe, it, expect } from "vitest";
import { getImageUrl } from "@/lib/image-utils";

describe("getImageUrl", () => {
  it("returns null for nullish input", () => {
    expect(getImageUrl(null)).toBeNull();
    expect(getImageUrl(undefined)).toBeNull();
    expect(getImageUrl("")).toBeNull();
  });

  it("passes through local URLs unchanged", () => {
    expect(getImageUrl("/images/foo.jpg")).toBe("/images/foo.jpg");
    expect(getImageUrl("https://vakaygo.com/x.png")).toBe(
      "https://vakaygo.com/x.png"
    );
  });

  it("strips key= from Google Places URLs and routes through proxy", () => {
    const url =
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=abc&key=STALE";
    const out = getImageUrl(url)!;
    expect(out).toMatch(/^\/api\/images\/proxy\?url=/);
    expect(decodeURIComponent(out)).not.toMatch(/key=/);
    expect(decodeURIComponent(out)).toMatch(/photoreference=abc/);
  });

  it("proxies Unsplash URLs", () => {
    const url = "https://images.unsplash.com/photo-123";
    const out = getImageUrl(url)!;
    expect(out).toMatch(/^\/api\/images\/proxy\?url=/);
    expect(decodeURIComponent(out)).toContain(url);
  });

  it("proxies Grok-generated images", () => {
    const url = "https://imgen.x.ai/abc";
    expect(getImageUrl(url)).toMatch(/^\/api\/images\/proxy\?url=/);
  });
});
