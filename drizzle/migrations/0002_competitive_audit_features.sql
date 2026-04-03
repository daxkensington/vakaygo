-- Cancellation policy and booking rules on listings
ALTER TABLE "listings" ADD COLUMN "cancellation_policy" varchar(32) DEFAULT 'moderate';
ALTER TABLE "listings" ADD COLUMN "min_stay" integer;
ALTER TABLE "listings" ADD COLUMN "max_stay" integer;
ALTER TABLE "listings" ADD COLUMN "advance_notice" integer;
ALTER TABLE "listings" ADD COLUMN "max_guests" integer;

-- Superhost fields on users
ALTER TABLE "users" ADD COLUMN "is_superhost" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN "superhost_since" timestamp;
