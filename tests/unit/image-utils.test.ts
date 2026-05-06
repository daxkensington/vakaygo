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

  it("returns null for legacy googleapis Place Photo URLs (cost-killing fallback)", () => {
    const url =
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=abc&key=STALE";
    expect(getImageUrl(url)).toBeNull();
  });

  it("passes Vercel Blob URLs through unchanged", () => {
    const url = "https://md5ccwdrtwgglaeh.public.blob.vercel-storage.com/places/abc.jpg";
    expect(getImageUrl(url)).toBe(url);
  });

  it("proxies hotlink-blocked CDNs (Facebook, Yelp)", () => {
    expect(getImageUrl("https://scontent.fbcdn.net/abc.jpg")).toMatch(
      /^\/api\/images\/proxy\?url=/
    );
    expect(getImageUrl("https://s3-media0.fl.yelpcdn.com/x.jpg")).toMatch(
      /^\/api\/images\/proxy\?url=/
    );
  });

  it("passes generic third-party URLs through (no proxy)", () => {
    const url = "https://images.unsplash.com/photo-123";
    expect(getImageUrl(url)).toBe(url);
  });
});
