/**
 * Token bucket rate limiter for serverless (Vercel) deployment.
 * Uses an in-memory Map — acceptable for single-region deployment.
 * Stale entries are automatically cleaned up every 5 minutes.
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until next token available
}

// In-memory store keyed by "ip:endpoint-type"
const buckets = new Map<string, TokenBucket>();

// Stale entry cleanup interval (5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

/**
 * Rate limit configurations by endpoint type.
 */
export const RATE_LIMITS = {
  auth: { maxTokens: 5, refillRate: 5 / 60, windowMs: 60_000 },
  ai: { maxTokens: 10, refillRate: 10 / 60, windowMs: 60_000 },
  write: { maxTokens: 30, refillRate: 30 / 60, windowMs: 60_000 },
  read: { maxTokens: 60, refillRate: 60 / 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

export type EndpointType = keyof typeof RATE_LIMITS;

/**
 * Determine the endpoint type from the request pathname and method.
 */
export function getEndpointType(pathname: string, method: string): EndpointType {
  if (pathname.startsWith("/api/auth")) return "auth";
  if (pathname.startsWith("/api/ai") || pathname.startsWith("/api/chat")) return "ai";
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return "write";
  return "read";
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Remove stale entries from the bucket map.
 * An entry is stale if it hasn't been accessed for longer than the
 * maximum window across all endpoint types (60 seconds + buffer).
 */
function cleanupStaleBuckets(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const staleThreshold = now - CLEANUP_INTERVAL_MS;
  buckets.forEach((bucket, key) => {
    if (bucket.lastRefill < staleThreshold) {
      buckets.delete(key);
    }
  });
}

/**
 * Check and consume a token from the rate limiter.
 */
export function rateLimit(ip: string, endpointType: EndpointType): RateLimitResult {
  // Run cleanup opportunistically
  cleanupStaleBuckets();

  const config = RATE_LIMITS[endpointType];
  const key = `${ip}:${endpointType}`;
  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket) {
    // First request — create a full bucket and consume one token
    bucket = { tokens: config.maxTokens - 1, lastRefill: now };
    buckets.set(key, bucket);
    return { allowed: true, remaining: bucket.tokens, retryAfter: 0 };
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  const tokensToAdd = elapsed * config.refillRate;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    // Not enough tokens — calculate retry-after
    const deficit = 1 - bucket.tokens;
    const retryAfter = Math.ceil(deficit / config.refillRate);
    return { allowed: false, remaining: 0, retryAfter };
  }

  // Consume a token
  bucket.tokens -= 1;
  return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfter: 0 };
}
