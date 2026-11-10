-- Old listing URLs that must keep working: a paused duplicate points at the listing
-- it duplicated, a listing moved to another destination points at its new URL.
-- The listing page 308-redirects /<island>/<slug> here before returning 404.
-- Additive; the app ignores this table until it exists (server/listing-redirects.ts).
CREATE TABLE IF NOT EXISTS "listing_slug_redirects" (
	"island_id" integer NOT NULL,
	"slug" varchar(128) NOT NULL,
	"target_listing_id" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_slug_redirects_pk" PRIMARY KEY("island_id","slug"),
	CONSTRAINT "listing_slug_redirects_reason_check" CHECK ("reason" IN ('duplicate','moved'))
);
--> statement-breakpoint
ALTER TABLE "listing_slug_redirects" ADD CONSTRAINT "listing_slug_redirects_island_id_islands_id_fk" FOREIGN KEY ("island_id") REFERENCES "public"."islands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "listing_slug_redirects" ADD CONSTRAINT "listing_slug_redirects_target_listing_id_listings_id_fk" FOREIGN KEY ("target_listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_slug_redirects_target_idx" ON "listing_slug_redirects" USING btree ("target_listing_id");
