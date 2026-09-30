import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/verify-email/confirm/route";

const id = "20000000-0000-4000-8000-000000000009";

it("keeps a listing claim on the confirmation page", async () => {
  const token = "a".repeat(64);
  const response = await GET(new NextRequest(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&claim=${id}`));
  const location = new URL(response.headers.get("location") || "");
  expect(location.pathname).toBe("/auth/verify-email");
  expect(location.searchParams.get("token")).toBe(token);
  expect(location.searchParams.get("claim")).toBe(id);
});

it("drops a claim value that is not a listing id", async () => {
  const token = "b".repeat(64);
  const response = await GET(new NextRequest(`https://vakaygo.com/api/auth/verify-email/confirm?token=${token}&claim=https://evil.example`));
  const location = new URL(response.headers.get("location") || "");
  expect(location.searchParams.get("token")).toBe(token);
  expect(location.searchParams.has("claim")).toBe(false);
});
