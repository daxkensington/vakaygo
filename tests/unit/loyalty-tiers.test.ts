import { describe, it, expect } from "vitest";
import { LOYALTY_TIERS } from "@/lib/loyalty-tiers";

describe("LOYALTY_TIERS", () => {
  it("has contiguous, non-overlapping point ranges starting at 0", () => {
    const tiers = Object.values(LOYALTY_TIERS).sort(
      (a, b) => a.minPoints - b.minPoints
    );
    expect(tiers[0].minPoints).toBe(0);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].minPoints).toBe(tiers[i - 1].maxPoints + 1);
    }
    expect(tiers[tiers.length - 1].maxPoints).toBe(Infinity);
  });

  it("has monotonically increasing discounts by tier", () => {
    const tiers = Object.values(LOYALTY_TIERS).sort(
      (a, b) => a.minPoints - b.minPoints
    );
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].discount).toBeGreaterThanOrEqual(tiers[i - 1].discount);
    }
  });

  it("captain tier maxes at Infinity (no cap)", () => {
    expect(LOYALTY_TIERS.captain.maxPoints).toBe(Infinity);
  });
});
