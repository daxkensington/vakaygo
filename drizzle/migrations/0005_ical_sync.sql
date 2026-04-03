-- Add iCal sync fields to listings
ALTER TABLE "listings" ADD COLUMN "ical_token" varchar(128);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "ical_import_url" text;
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "ical_last_sync" timestamp;
