CREATE TABLE "entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"embedding" vector(1536),
	CONSTRAINT "entities_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE INDEX "entities_kind_idx" ON "entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "entities_name_idx" ON "entities" USING btree ("name");