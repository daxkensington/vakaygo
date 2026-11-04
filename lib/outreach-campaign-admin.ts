import { z } from "zod";
import { isCountryCode } from "@/lib/countries";

export const OUTREACH_PERMISSION_PROVIDERS = ["resend", "sendcorex", "mailforge", "infraforge"] as const;
export type OutreachPermissionProvider = typeof OUTREACH_PERMISSION_PROVIDERS[number];
const version = z.number().int().min(0).max(2_147_483_646);
const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().max(254).regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/);
const explanation = z.string().trim().min(20).max(2000);
const country = z.string().trim().toUpperCase().refine(isCountryCode, "Select an assigned country code.");

const grant = z.object({
  action: z.literal("grant_consent"), listingId: uuid, recipientEmail: email,
  expectedListingEmail: email, provider: z.enum(OUTREACH_PERMISSION_PROVIDERS),
  permissionKind: z.enum(["explicit_opt_in", "business_outreach_permission"]),
  evidence: explanation, recipientCountry: country.nullable().optional(),
  policyReference: z.string().trim().max(2000).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.recipientEmail !== value.expectedListingEmail) ctx.addIssue({ code: "custom", message: "The recipient must match the reviewed listing email." });
  if (value.permissionKind === "business_outreach_permission" &&
    (value.provider === "resend" || !value.recipientCountry || !value.policyReference || value.policyReference.length < 20)) {
    ctx.addIssue({ code: "custom", message: "Business outreach requires a supported policy basis, recipient country and documented review; Resend requires explicit opt-in." });
  }
});

const actionSchema = z.union([
  z.object({ action: z.literal("pause"), expectedVersion: version, reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("enable"), expectedVersion: version }).strict(),
  z.object({ action: z.literal("select_provider"), expectedVersion: version, provider: z.enum(OUTREACH_PERMISSION_PROVIDERS) }).strict(),
  z.object({ action: z.literal("request_stage"), expectedVersion: version, stage: z.number().int().min(1).max(4) }).strict(),
  grant,
  z.object({ action: z.literal("revoke_consent"), consentId: uuid, reason: z.string().trim().min(5).max(500) }).strict(),
]);

export type CampaignAdminAction = z.infer<typeof actionSchema>;
export function parseCampaignAdminAction(value: unknown): CampaignAdminAction | null {
  const parsed = actionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type CampaignControl = {
  enabled: boolean; stage: number; provider: string; version: number;
  stageStartedAt: string; updatedAt: string; pauseReason: string | null;
};
export type CampaignPermission = {
  id: string; listingId: string; listingTitle: string; recipientEmail: string;
  provider: string; permissionKind: string; recipientCountry: string | null;
  evidence: string; policyReference: string | null; grantedAt: string; grantedBy: string | null;
  revokedAt: string | null; revocationReason: string | null; suppressed: boolean;
};
export type CampaignReport = {
  control: CampaignControl;
  caps: readonly number[];
  prerequisites: { ready: boolean; reasons: string[] };
  health: { ready: boolean; reasons: string[]; nextStageAllowed: boolean; promotionReasons?: string[] };
  metrics: {
    reserved24h: number; accepted: number; delivered: number; bounced: number; complained: number;
    uncertain: number; failed: number; opened: number; clicked: number;
    matureAccepted: number; matureResolved: number; suppressions: number; activePermissions: number;
    linkVisits: number; approvedClaimsFromLinks: number;
  };
  permissions: CampaignPermission[];
};
