import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createConnectAccount, createAccountLink, getAccountStatus } from "@/server/stripe";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

/**
 * POST: Create a Stripe Connect account for operator and return onboarding URL
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "operator") {
      return NextResponse.json({ error: "Operators only" }, { status: 403 });
    }

    const db = drizzle(neon(process.env.DATABASE_URL!));

    // Get operator
    const [operator] = await db
      .select({
        id: users.id,
        email: users.email,
        businessName: users.businessName,
        digipayMerchantId: users.digipayMerchantId,
      })
      .from(users)
      .where(eq(users.id, payload.id as string))
      .limit(1);

    if (!operator) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let stripeAccountId = operator.digipayMerchantId;

    // Create Stripe Connect account if doesn't exist
    if (!stripeAccountId) {
      const account = await createConnectAccount({
        email: operator.email,
        businessName: operator.businessName || "VakayGo Operator",
      });

      stripeAccountId = account.id;

      // Save to database (using digipayMerchantId field for Stripe account ID)
      await db
        .update(users)
        .set({
          digipayMerchantId: stripeAccountId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, operator.id));
    }

    // Create onboarding link
    const onboardingUrl = await createAccountLink(stripeAccountId);

    return NextResponse.json({ url: onboardingUrl });
  } catch (error) {
    logger.error("Connect error", error);
    return NextResponse.json({ error: "Failed to setup payments" }, { status: 500 });
  }
}

/**
 * GET: Check operator's Stripe account status
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET);
    const db = drizzle(neon(process.env.DATABASE_URL!));

    const [operator] = await db
      .select({ digipayMerchantId: users.digipayMerchantId })
      .from(users)
      .where(eq(users.id, payload.id as string))
      .limit(1);

    if (!operator?.digipayMerchantId) {
      return NextResponse.json({ connected: false });
    }

    const status = await getAccountStatus(operator.digipayMerchantId);

    return NextResponse.json({
      connected: true,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
    });
  } catch (error) {
    logger.error("Account status error", error);
    return NextResponse.json({ connected: false });
  }
}
