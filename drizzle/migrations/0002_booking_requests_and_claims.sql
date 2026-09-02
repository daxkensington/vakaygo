CREATE TYPE "public"."listing_claim_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE IF NOT EXISTS 'requested' BEFORE 'pending';--> statement-breakpoint
CREATE TABLE "listing_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"status" "listing_claim_status" DEFAULT 'pending' NOT NULL,
	"contact_name" varchar(256) NOT NULL,
	"contact_phone" varchar(40) NOT NULL,
	"role_at_business" varchar(128),
	"notes" text,
	"admin_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "price_currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "promo_codes" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "magic_link_token" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "magic_link_expires" timestamp;--> statement-breakpoint
ALTER TABLE "listing_claims" ADD CONSTRAINT "listing_claims_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_claims" ADD CONSTRAINT "listing_claims_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_claims" ADD CONSTRAINT "listing_claims_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_claims_listing_idx" ON "listing_claims" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_claims_operator_idx" ON "listing_claims" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "listing_claims_status_idx" ON "listing_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_magic_link_token_idx" ON "users" USING btree ("magic_link_token");