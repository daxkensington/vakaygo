-- Loyalty Points & Referral Program
-- Add loyalty columns to users table
ALTER TABLE "users" ADD COLUMN "loyalty_points" integer DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "loyalty_tier" varchar(16) DEFAULT 'explorer';
ALTER TABLE "users" ADD COLUMN "referral_code" varchar(16);
ALTER TABLE "users" ADD COLUMN "referred_by" uuid;

-- Loyalty transactions table
CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "points" integer NOT NULL,
  "description" text,
  "booking_id" uuid REFERENCES "bookings"("id"),
  "referral_id" uuid,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "loyalty_user_idx" ON "loyalty_transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "loyalty_created_idx" ON "loyalty_transactions" ("created_at");

-- Referrals table
CREATE TABLE IF NOT EXISTS "referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_id" uuid NOT NULL REFERENCES "users"("id"),
  "referred_id" uuid REFERENCES "users"("id"),
  "referred_email" varchar(320),
  "code" varchar(16) NOT NULL UNIQUE,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "referrer_reward" integer DEFAULT 500,
  "referred_reward" integer DEFAULT 500,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "referrals_referrer_idx" ON "referrals" ("referrer_id");
CREATE INDEX IF NOT EXISTS "referrals_code_idx" ON "referrals" ("code");
