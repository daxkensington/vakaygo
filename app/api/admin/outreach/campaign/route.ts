import { NextRequest } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { interestResponse, sameOriginMutation } from "@/server/interest-http";
import { parseCampaignAdminAction } from "@/lib/outreach-campaign-admin";
import { applyCampaignAdminAction, CampaignControlError, readCampaignReport } from "@/server/outreach-campaign-control";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  try { return interestResponse(await readCampaignReport()); }
  catch (error) {
    return interestResponse({ error: error instanceof CampaignControlError ? error.message : "Campaign reporting is unavailable." }, error instanceof CampaignControlError ? error.status : 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOriginMutation(request)) return interestResponse({ error: "Invalid request origin or content type." }, 403);
  const auth = await requireAdmin();
  if (!auth.ok) return auth.error;
  let action;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return interestResponse({ error: "Campaign request is too large." }, 413);
    action = parseCampaignAdminAction(JSON.parse(raw));
  } catch { return interestResponse({ error: "Invalid campaign request." }, 400); }
  if (!action) return interestResponse({ error: "Invalid campaign action. Record the exact recipient, permission evidence and applicable provider policy." }, 400);
  try {
    await applyCampaignAdminAction(auth, action);
    return interestResponse({ saved: true });
  } catch (error) {
    return interestResponse({ error: error instanceof CampaignControlError ? error.message : "Could not update the campaign." }, error instanceof CampaignControlError ? error.status : 503);
  }
}
