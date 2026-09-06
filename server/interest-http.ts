import { NextRequest, NextResponse } from "next/server";
export function interestResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function sameOriginMutation(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin && request.headers.get("content-type")?.split(";")[0].trim() === "application/json";
}
