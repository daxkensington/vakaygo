import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
describe("Booking and webhook route regressions", () => {
  it("runs the actual routes against deterministic database and Stripe doubles", () => {
    const output = execFileSync(process.execPath, [resolve("tests/regression/booking-integrity.cjs")], { encoding:"utf8" });
    const result = JSON.parse(output);
    expect(result.checks).toBeGreaterThanOrEqual(30);
    expect(result.passed).toBe(result.checks);
  }, 30000);
});
