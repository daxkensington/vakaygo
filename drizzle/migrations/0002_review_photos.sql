CREATE TABLE "review_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(256),
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "review_photos_review_idx" ON "review_photos" USING btree ("review_id");

ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
