import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrustBadges } from "@/components/listings/trust-badges";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async (node: React.ReactNode) => { await act(async () => { root.render(node); }); };

it("labels a listing nobody has claimed as public data", async () => {
  await render(<TrustBadges unclaimed avgRating="5.0" reviewCount={460} ratingSource="google" />);
  expect(container.textContent).toContain("Listed from public data");
  expect(container.textContent).toContain("5.0 on Google");
  expect(container.textContent).not.toContain("Ownership verified");
});

it("shows a claimed Google-imported listing as ownership verified, never as public data", async () => {
  await render(<TrustBadges claimVerified avgRating="5.0" reviewCount={460} ratingSource="google" />);
  expect(container.textContent).toContain("Ownership verified");
  expect(container.textContent).toContain("5.0 on Google");
  expect(container.textContent).not.toMatch(/Listed from public data|Top rated|Verified operator|Free cancellation/);
});

it("keeps booking promises for a bookable claimed listing", async () => {
  await render(<TrustBadges claimVerified bookingEligible isInstantBook avgRating="4.9" reviewCount={12} />);
  expect(container.textContent).toContain("Free cancellation");
  expect(container.textContent).toContain("Instant book");
  expect(container.textContent).toContain("Top rated");
  expect(container.textContent).toContain("Verified operator");
  expect(container.textContent).not.toContain("Ownership verified");
});
