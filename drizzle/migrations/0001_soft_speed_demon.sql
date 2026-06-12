ALTER TYPE "public"."listing_type" ADD VALUE IF NOT EXISTS 'spa';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD COLUMN "last_known_price" numeric(10, 2);