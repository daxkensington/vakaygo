import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, getEndpointType, getClientIp } from "./lib/rate-limit";
import "./lib/env";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

async function getSessionRole(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Security headers applied to every response.
 */
// CSP notes:
// - 'unsafe-inline' on script-src is required by Next.js framework runtime
//   inline scripts (hydration data, JSON-LD blocks). We deliberately don't
//   use nonce-based CSP because per Next.js 16 docs it forces every page
//   into dynamic rendering — that kills CDN caching + PPR for our 7k+
//   listing pages. Mitigation: experimental SRI is enabled in
//   next.config.ts so static assets carry sha256 integrity hashes.
// - 'unsafe-eval' is needed by mapbox-gl GLSL shader compilation in some
//   browsers; without it the map fails to render.
// - style-src 'unsafe-inline' is needed by next/font and Tailwind's runtime
//   style injection.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(self)",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://www.googletagmanager.com https://www.google-analytics.com https://*.sentry.io",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // img-src is intentionally open to https: — listing photos come from
    // 7k+ different operator websites (Cloudinary, WordPress, Squarespace,
    // etc.) and no manageable allowlist covers them all. Routing every
    // image through our proxy was a measured LCP regression. Risk is low
    // since browsers don't execute image content; CSP still blocks
    // active content (script/connect/frame) tightly.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.vercel-analytics.com https://*.vercel.app https://api.x.ai https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.resend.com https://*.mapbox.com https://api.mapbox.com https://events.mapbox.com https://*.sentry.io https://www.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
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
export async function proxy(request: NextRequest): Promise<NextResponse> {
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

  // Edge-level RBAC gate for /api/admin and /api/operator.
  // Per-route handlers still re-verify against the DB; this is a fast-fail
  // to drop unauthenticated/under-privileged traffic before it hits the route.
  const needsAdmin = pathname.startsWith("/api/admin");
  const needsOperator = pathname.startsWith("/api/operator");
  if (needsAdmin || needsOperator) {
    const token = request.cookies.get("session")?.value;
    const role = await getSessionRole(token);
    if (!role) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    if (needsAdmin && role !== "admin") {
      return applySecurityHeaders(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }
    if (needsOperator && role !== "operator" && role !== "admin") {
      return applySecurityHeaders(
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
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
