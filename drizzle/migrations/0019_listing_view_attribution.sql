-- Listing-view attribution. Additive only: six columns on listing_views; no existing row loses data.
-- The app writes and filters on these columns only once they exist (server/listing-view-attribution.ts),
-- so this can be applied before or after the code that uses it.
ALTER TABLE "listing_views" ADD COLUMN "ua_family" varchar(24);--> statement-breakpoint
ALTER TABLE "listing_views" ADD COLUMN "referrer_host" varchar(128);--> statement-breakpoint
ALTER TABLE "listing_views" ADD COLUMN "utm_source" varchar(64);--> statement-breakpoint
ALTER TABLE "listing_views" ADD COLUMN "country" varchar(2);--> statement-breakpoint
ALTER TABLE "listing_views" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_views" ADD COLUMN "bot_reason" varchar(24);
--> statement-breakpoint
-- History: 116.179.33.0/24 is a published Baiduspider block. The 2026-10-26 audit traced 1,427 of 7,204
-- views in 30 days to it. Flagged, not deleted.
UPDATE "listing_views" SET "is_bot" = true, "bot_reason" = 'crawler_network' WHERE "viewer_ip" LIKE '116.179.33.%';
