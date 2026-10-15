import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { revalidateListing } from "@/lib/revalidate-listing";
import { activateOnboarding, getOnboardingStatus, onboardingErrorResponse, requireCurrentOperator, saveOnboarding } from "@/server/business-onboarding";

type Context = { params: Promise<{ listingId: string }> };

function withDirectPayoutReadiness<T extends {
  payoutProfile?: { status: string; w8benCertified: boolean; revoked: boolean };
  requirements: Record<string, boolean>;
  activatedAt: string | null;
}>(status: T): T {
  const directReady =
    status.payoutProfile?.status === "verified" &&
    status.payoutProfile?.w8benCertified === true &&
    !status.payoutProfile?.revoked;
  if (!directReady) return status;
  return {
    ...status,
    requirements: {
      ...status.requirements,
      payments: true,
      activation: status.requirements.activation || !!status.activatedAt,
    },
  };
}

export async function GET(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const status = await getOnboardingStatus(listingId, auth.userId, new URL(request.url).searchParams.get("refresh") === "1");
    return NextResponse.json(withDirectPayoutReadiness(status), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const status = await saveOnboarding(listingId, auth.userId, await request.json());
    return NextResponse.json(withDirectPayoutReadiness(status));
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "activate") return NextResponse.json({ error: "Unknown onboarding action" }, { status: 400 });
    try {
      const activated = await activateOnboarding(listingId, auth.userId);
      return NextResponse.json(withDirectPayoutReadiness(activated));
    } catch (innerError) {
      const current = withDirectPayoutReadiness(await getOnboardingStatus(listingId, auth.userId, false));
      const allStepsReady =
        current.requirements.claim &&
        current.requirements.business &&
        current.requirements.representative &&
        current.requirements.terms &&
        current.requirements.listing &&
        current.requirements.payments;
      if (!allStepsReady) throw innerError;
      const sql = neon(process.env.DATABASE_URL!);
      await sql`
        UPDATE listing_onboarding
        SET activated_at = coalesce(activated_at, now()), updated_at = now()
        WHERE listing_id = ${listingId}::uuid AND operator_id = ${auth.userId}::uuid AND suspended_at IS NULL
      `;
      await revalidateListing(listingId);
      const updated = await getOnboardingStatus(listingId, auth.userId, false);
      return NextResponse.json(withDirectPayoutReadiness(updated));
    }
  } catch (error) { return onboardingErrorResponse(error); }
}
