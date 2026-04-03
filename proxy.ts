import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, getEndpointType, getClientIp } from "./lib/rate-limit";

/**
 * Security headers applied to every response.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(self)",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.tile.openstreetmap.org https://*.vercel-storage.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.vercel-analytics.com https://*.vercel.app https://api.x.ai https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.resend.com",
    "frame-ancestors 'none'",
  ].join("; "),
};

/**
 * Apply security headers to a response.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Next.js 16 proxy function (replaces middleware).
 * - Rate limits all /api/* routes
 * - Adds security headers to every response
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Rate limit API routes
  if (pathname.startsWith("/api")) {
    const ip = getClientIp(request.headers);
    const endpointType = getEndpointType(pathname, method);
    const result = rateLimit(ip, endpointType);

    if (!result.allowed) {
      const rateLimitResponse = NextResponse.json(
        { error: "Too many requests", retryAfter: result.retryAfter },
        { status: 429 }
      );
      rateLimitResponse.headers.set("Retry-After", String(result.retryAfter));
      return applySecurityHeaders(rateLimitResponse);
    }
  }

  // Continue with security headers on all responses
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
