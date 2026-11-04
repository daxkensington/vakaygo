import { NextResponse } from "next/server";
import { activateOnboarding, getOnboardingStatus, onboardingErrorResponse, requireCurrentOperator, saveOnboarding } from "@/server/business-onboarding";

type Context = { params: Promise<{ listingId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const status = await getOnboardingStatus(listingId, auth.userId, new URL(request.url).searchParams.get("refresh") === "1");
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const status = await saveOnboarding(listingId, auth.userId, await request.json());
    return NextResponse.json(status);
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const auth = await requireCurrentOperator();
    if (!auth.ok) return auth.error;
    const { listingId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "activate") return NextResponse.json({ error: "Unknown onboarding action" }, { status: 400 });
    return NextResponse.json(await activateOnboarding(listingId, auth.userId));
  } catch (error) { return onboardingErrorResponse(error); }
}
