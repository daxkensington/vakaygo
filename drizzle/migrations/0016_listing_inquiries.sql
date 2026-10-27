CREATE TABLE "listing_inquiries" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "listing_id" uuid NOT NULL REFERENCES "listings"("id") ON DELETE CASCADE,
 "traveler_email" varchar(254) NOT NULL,
 "start_date" date,
 "end_date" date,
 "party_size" integer DEFAULT 1 NOT NULL,
 "message" text DEFAULT '' NOT NULL,
 "status" varchar(16) DEFAULT 'new' NOT NULL,
 "team_notified_at" timestamp with time zone,
 "traveler_notified_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "listing_inquiries_dates_check" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"),
 CONSTRAINT "listing_inquiries_party_size_check" CHECK ("party_size" BETWEEN 1 AND 100),
 CONSTRAINT "listing_inquiries_message_check" CHECK (length("message") <= 2000),
 CONSTRAINT "listing_inquiries_status_check" CHECK ("status" IN ('new','reviewing','closed'))
);
--> statement-breakpoint
CREATE INDEX "listing_inquiries_listing_created_idx" ON "listing_inquiries" ("listing_id","created_at");
--> statement-breakpoint
CREATE INDEX "listing_inquiries_email_created_idx" ON "listing_inquiries" ("traveler_email","created_at");
--> statement-breakpoint
CREATE INDEX "listing_inquiries_status_created_idx" ON "listing_inquiries" ("status","created_at");
--> statement-breakpoint
CREATE FUNCTION vakaygo_create_listing_inquiry(
 p_listing uuid,
 p_email varchar,
 p_start date,
 p_end date,
 p_party integer,
 p_message text
) RETURNS TABLE(inquiry_id uuid, created boolean) LANGUAGE plpgsql AS $$
DECLARE
 l listings%ROWTYPE;
 i listing_inquiries%ROWTYPE;
 normalized_email varchar(254) := lower(trim(p_email));
BEGIN
 IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   OR p_party IS NULL OR p_party NOT BETWEEN 1 AND 100
   OR length(p_message) > 2000
   OR (p_end IS NOT NULL AND (p_start IS NULL OR p_end < p_start))
   OR p_start < current_date OR p_start > current_date + 730
   OR p_end < current_date OR p_end > current_date + 730
 THEN
   RAISE EXCEPTION 'VG_INQUIRY:INPUT';
 END IF;

 -- Serialize each address across listings so concurrent requests cannot bypass
 -- the daily cap. Hash collisions only reduce concurrency; they do not relax it.
 PERFORM pg_advisory_xact_lock(hashtext(normalized_email));

 SELECT * INTO l FROM listings WHERE id=p_listing;
 IF l.id IS NULL OR l.status<>'active'
   OR NOT EXISTS(SELECT 1 FROM islands WHERE id=l.island_id AND is_active=true)
   OR l.operator_id='197d8586-7fd3-4999-91de-a50ad7d70e23'
   OR vakaygo_listing_claim_verified(l.id)
 THEN
   RAISE EXCEPTION 'VG_INQUIRY:UNAVAILABLE';
 END IF;

 SELECT * INTO i FROM listing_inquiries
 WHERE listing_id=p_listing AND traveler_email=normalized_email
   AND created_at>now()-interval '15 minutes'
 ORDER BY created_at DESC LIMIT 1;
 IF i.id IS NOT NULL THEN
   RETURN QUERY SELECT i.id,false;
   RETURN;
 END IF;

 IF (SELECT count(*) FROM listing_inquiries
     WHERE traveler_email=normalized_email AND created_at>now()-interval '24 hours')>=5
 THEN
   RAISE EXCEPTION 'VG_INQUIRY:LIMIT';
 END IF;

 INSERT INTO listing_inquiries(listing_id,traveler_email,start_date,end_date,party_size,message)
 VALUES(p_listing,normalized_email,p_start,p_end,p_party,coalesce(p_message,''))
 RETURNING * INTO i;

 -- This is an internal demand signal only. It grants no outreach permission and
 -- does not share the traveler's identity or message with the business.
 INSERT INTO business_outreach(listing_id) VALUES(p_listing) ON CONFLICT DO NOTHING;
 RETURN QUERY SELECT i.id,true;
END $$;
