-- Blog Posts
DO $$ BEGIN
  CREATE TYPE "blog_post_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(300) NOT NULL UNIQUE,
  "title" varchar(256) NOT NULL,
  "excerpt" text,
  "content" text NOT NULL,
  "cover_image" text,
  "author_id" uuid NOT NULL REFERENCES "users"("id"),
  "island_id" integer REFERENCES "islands"("id"),
  "category" varchar(64) NOT NULL,
  "tags" json,
  "status" "blog_post_status" DEFAULT 'draft' NOT NULL,
  "meta_title" varchar(256),
  "meta_description" varchar(512),
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "blog_posts_slug_idx" ON "blog_posts" ("slug");
CREATE INDEX IF NOT EXISTS "blog_posts_status_idx" ON "blog_posts" ("status");
CREATE INDEX IF NOT EXISTS "blog_posts_island_idx" ON "blog_posts" ("island_id");
CREATE INDEX IF NOT EXISTS "blog_posts_category_idx" ON "blog_posts" ("category");
