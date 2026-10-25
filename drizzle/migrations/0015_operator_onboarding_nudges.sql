-- Operator onboarding reminders. Additive only: no existing claims, listings, bookings, prices or mail change.
-- One row per reminder actually handed to the mail provider; the unique index is the send claim,
-- so two overlapping cron runs cannot both email the same listing about the same step on one day.
CREATE TABLE operator_onboarding_nudges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 operator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stage varchar(32) NOT NULL CHECK(stage IN ('business_details','listing_setup','payout_setup','payout_rejected','activate','admin_review')),
 recipient varchar(320) NOT NULL,
 sent_on date NOT NULL DEFAULT current_date,
 sent_at timestamptz NOT NULL DEFAULT now(),
 provider_message_id varchar(128)
);
--> statement-breakpoint
CREATE UNIQUE INDEX operator_onboarding_nudges_daily_unique ON operator_onboarding_nudges(listing_id,stage,sent_on);
--> statement-breakpoint
CREATE INDEX operator_onboarding_nudges_listing_idx ON operator_onboarding_nudges(listing_id,sent_at DESC);
--> statement-breakpoint
-- A business that clicks "stop reminders" is never emailed about setup again, for any of its listings.
CREATE TABLE operator_onboarding_nudge_optouts (
 operator_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 source varchar(32) NOT NULL DEFAULT 'email_link',
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Kill switch, visible and editable at /admin/feature-flags.
INSERT INTO feature_flags(key,enabled,rollout_percent,description)
VALUES('operator_onboarding_nudges_enabled',true,100,'Email claimed businesses that stalled before activation: next step only, first after 48h, then weekly, max 3 per step, local business hours. Also reminds the team about payout profiles and listings waiting on review.')
ON CONFLICT (key) DO NOTHING;
