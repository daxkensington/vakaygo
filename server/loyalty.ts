import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, sql, and, desc } from "drizzle-orm";
import { users, loyaltyTransactions, referrals, bookings } from "@/drizzle/schema";

function getDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// ─── TIER DEFINITIONS (imported from shared lib, re-exported for consumers) ──
import { LOYALTY_TIERS, type LoyaltyTier } from "@/lib/loyalty-tiers";
export { LOYALTY_TIERS, type LoyaltyTier };

// ─── POINTS CONSTANTS ──────────────────────────────────────────
export const POINTS_PER_DOLLAR = 10;
export const REVIEW_POINTS = 100;
export const REFERRAL_POINTS = 500;
export const FIRST_BOOKING_BONUS = 200;
export const BIRTHDAY_BONUS = 100; // TODO: implement birthday bonus
export const POINTS_PER_DOLLAR_CREDIT = 100; // 1000 points = $10 → 100 points = $1
export const MIN_REDEMPTION_POINTS = 500;
export const POINTS_EXPIRY_MONTHS = 12;

// ─── CALCULATE TIER ────────────────────────────────────────────
export function calculateTier(totalPoints: number): LoyaltyTier {
  if (totalPoints >= 15000) return "captain";
  if (totalPoints >= 5000) return "voyager";
  if (totalPoints >= 1000) return "adventurer";
  return "explorer";
}

export function getNextTier(currentTier: LoyaltyTier): { tier: LoyaltyTier; pointsNeeded: number } | null {
  const order: LoyaltyTier[] = ["explorer", "adventurer", "voyager", "captain"];
  const idx = order.indexOf(currentTier);
  if (idx >= order.length - 1) return null;
  const next = order[idx + 1];
  return { tier: next, pointsNeeded: LOYALTY_TIERS[next].minPoints };
}

// ─── AWARD POINTS ──────────────────────────────────────────────
export async function awardPoints(params: {
  userId: string;
  type: string;
  points: number;
  description: string;
  bookingId?: string;
  referralId?: string;
}) {
  const db = getDb();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + POINTS_EXPIRY_MONTHS);

  await db.insert(loyaltyTransactions).values({
    userId: params.userId,
    type: params.type,
    points: params.points,
    description: params.description,
    bookingId: params.bookingId || null,
    referralId: params.referralId || null,
    expiresAt,
  });

  // Update user's total points and tier
  const [user] = await db
    .select({ loyaltyPoints: users.loyaltyPoints })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const newTotal = (user?.loyaltyPoints || 0) + params.points;
  const newTier = calculateTier(newTotal);

  await db
    .update(users)
    .set({
      loyaltyPoints: newTotal,
      loyaltyTier: newTier,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));

  return { newTotal, newTier };
}

// ─── REDEEM POINTS ─────────────────────────────────────────────
export async function redeemPoints(params: {
  userId: string;
  points: number;
  description: string;
  bookingId?: string;
}) {
  if (params.points < MIN_REDEMPTION_POINTS) {
    throw new Error(`Minimum redemption is ${MIN_REDEMPTION_POINTS} points`);
  }

  const db = getDb();

  const [user] = await db
    .select({ loyaltyPoints: users.loyaltyPoints })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user || (user.loyaltyPoints || 0) < params.points) {
    throw new Error("Insufficient points balance");
  }

  await db.insert(loyaltyTransactions).values({
    userId: params.userId,
    type: "redeemed",
    points: -params.points,
    description: params.description,
    bookingId: params.bookingId || null,
  });

  const newTotal = (user.loyaltyPoints || 0) - params.points;
  const newTier = calculateTier(newTotal);

  await db
    .update(users)
    .set({
      loyaltyPoints: newTotal,
      loyaltyTier: newTier,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));

  const creditAmount = params.points / POINTS_PER_DOLLAR_CREDIT;

  return { newTotal, newTier, creditAmount };
}

// ─── AWARD BOOKING POINTS ──────────────────────────────────────
export async function awardBookingPoints(userId: string, bookingId: string, totalAmount: number) {
  const points = Math.floor(totalAmount * POINTS_PER_DOLLAR);
  if (points <= 0) return;

  await awardPoints({
    userId,
    type: "earned_booking",
    points,
    description: `Earned ${points} points for booking`,
    bookingId,
  });

  // Check if this is user's first completed booking → bonus
  const db = getDb();
  const completedBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.travelerId, userId), eq(bookings.status, "completed")))
    .limit(2);

  if (completedBookings.length === 1) {
    await awardPoints({
      userId,
      type: "bonus",
      points: FIRST_BOOKING_BONUS,
      description: "First booking bonus! Welcome to VakayGo Rewards",
      bookingId,
    });
  }

  // Check referral bonus
  const [user] = await db
    .select({ referredBy: users.referredBy })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.referredBy && completedBookings.length === 1) {
    // Find the referral record
    const [referral] = await db
      .select()
      .from(referrals)
      .where(and(eq(referrals.referredId, userId), eq(referrals.status, "signed_up")))
      .limit(1);

    if (referral) {
      // Award referral bonus to both parties
      await awardPoints({
        userId: referral.referrerId,
        type: "earned_referral",
        points: referral.referrerReward || REFERRAL_POINTS,
        description: "Referral bonus — your friend completed their first booking!",
        referralId: referral.id,
      });

      await awardPoints({
        userId,
        type: "earned_referral",
        points: referral.referredReward || REFERRAL_POINTS,
        description: "Welcome bonus — referred by a friend!",
        referralId: referral.id,
      });

      // Update referral status
      await db
        .update(referrals)
        .set({ status: "rewarded", completedAt: new Date() })
        .where(eq(referrals.id, referral.id));
    }
  }
}

// ─── AWARD REVIEW POINTS ───────────────────────────────────────
export async function awardReviewPoints(userId: string, bookingId: string) {
  await awardPoints({
    userId,
    type: "earned_review",
    points: REVIEW_POINTS,
    description: `Earned ${REVIEW_POINTS} points for leaving a review`,
    bookingId,
  });
}

// ─── GENERATE REFERRAL CODE ────────────────────────────────────
export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "VG-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── GET USER LOYALTY DATA ─────────────────────────────────────
export async function getUserLoyaltyData(userId: string) {
  const db = getDb();

  const [user] = await db
    .select({
      loyaltyPoints: users.loyaltyPoints,
      loyaltyTier: users.loyaltyTier,
      referralCode: users.referralCode,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const tier = (user.loyaltyTier || "explorer") as LoyaltyTier;
  const points = user.loyaltyPoints || 0;
  const tierInfo = LOYALTY_TIERS[tier];
  const nextTier = getNextTier(tier);

  return {
    points,
    tier,
    tierInfo,
    nextTier: nextTier
      ? {
          ...nextTier,
          tierInfo: LOYALTY_TIERS[nextTier.tier],
          pointsRemaining: nextTier.pointsNeeded - points,
        }
      : null,
    referralCode: user.referralCode,
    discount: tierInfo.discount,
  };
}

// ─── GET TRANSACTION HISTORY ───────────────────────────────────
export async function getLoyaltyTransactions(
  userId: string,
  options: { limit?: number; offset?: number; filter?: string } = {}
) {
  const db = getDb();
  const { limit = 20, offset = 0, filter } = options;

  let query = db
    .select()
    .from(loyaltyTransactions)
    .where(
      filter && filter !== "all"
        ? and(
            eq(loyaltyTransactions.userId, userId),
            filter === "earned"
              ? sql`${loyaltyTransactions.points} > 0`
              : sql`${loyaltyTransactions.points} < 0`
          )
        : eq(loyaltyTransactions.userId, userId)
    )
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return query;
}

// ─── GET REFERRAL STATS ────────────────────────────────────────
export async function getReferralStats(userId: string) {
  const db = getDb();

  const allReferrals = await db
    .select()
    .from(referrals)
    .where(eq(referrals.referrerId, userId));

  const invited = allReferrals.length;
  const signedUp = allReferrals.filter((r) => r.status !== "pending").length;
  const booked = allReferrals.filter((r) => r.status === "rewarded").length;
  const totalEarned = booked * REFERRAL_POINTS;

  return { invited, signedUp, booked, totalEarned, referrals: allReferrals };
}
