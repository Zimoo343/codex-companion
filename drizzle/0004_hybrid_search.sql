ALTER TABLE "guides" ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(section, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;
--> statement-breakpoint
CREATE INDEX "guides_content_tsv_idx" ON "guides" USING gin ("content_tsv");
