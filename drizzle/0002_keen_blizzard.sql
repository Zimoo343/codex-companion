CREATE TABLE "guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_name" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"license_note" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"content_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	CONSTRAINT "guides_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE INDEX "guides_source_idx" ON "guides" USING btree ("source_name");--> statement-breakpoint
CREATE INDEX "guides_published_idx" ON "guides" USING btree ("published_at");
-- vector similarity search: cosine distance, HNSW for fast approximate top-k
CREATE INDEX "guides_embedding_idx" ON "guides" USING hnsw ("embedding" vector_cosine_ops);
