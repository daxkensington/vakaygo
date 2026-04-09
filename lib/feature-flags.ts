import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { featureFlags } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

// In-memory cache with 60-second TTL
const cache = new Map<
  string,
  {
    enabled: boolean;
    rolloutPercent: number | null;
    allowedUsers: string[] | null;
    fetchedAt: number;
  }
>();

const CACHE_TTL_MS = 60_000; // 60 seconds

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

/**
 * Check if a feature flag is enabled for a given user.
 *
 * Logic:
 * 1. If the flag doesn't exist or is disabled, return false.
 * 2. If allowedUsers is set and the userId is in the list, return true.
 * 3. If rolloutPercent < 100, hash the userId to determine if they're in the rollout.
 * 4. Otherwise, return the enabled state.
 */
export async function isFeatureEnabled(
  key: string,
  userId?: string
): Promise<boolean> {
  try {
    // Check cache first
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return evaluateFlag(cached, userId);
    }

    // Fetch from database
    const db = getDb();
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1);

    if (!flag) {
      // Cache the miss too so we don't keep querying
      cache.set(key, {
        enabled: false,
        rolloutPercent: 100,
        allowedUsers: null,
        fetchedAt: Date.now(),
      });
      return false;
    }

    const entry = {
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
      allowedUsers: flag.allowedUsers,
      fetchedAt: Date.now(),
    };

    cache.set(key, entry);

    return evaluateFlag(entry, userId);
  } catch (error) {
    console.error(`Feature flag check error for "${key}":`, error);
    // Fail closed — feature is off if we can't check
    return false;
  }
}

function evaluateFlag(
  flag: {
    enabled: boolean;
    rolloutPercent: number | null;
    allowedUsers: string[] | null;
  },
  userId?: string
): boolean {
  if (!flag.enabled) return false;

  // If there's an allowlist and the user is on it, always return true
  if (userId && flag.allowedUsers && flag.allowedUsers.includes(userId)) {
    return true;
  }

  // If rollout is less than 100%, use deterministic hashing
  const rollout = flag.rolloutPercent ?? 100;
  if (rollout < 100 && userId) {
    const hash = simpleHash(userId);
    const bucket = hash % 100;
    return bucket < rollout;
  }

  // If no userId and rollout < 100, can't determine — default to enabled
  if (rollout < 100 && !userId) {
    return false;
  }

  return true;
}

/**
 * Simple deterministic hash for userId -> 0-based bucket.
 * Not cryptographic, just for consistent rollout bucketing.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
