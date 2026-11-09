CREATE TABLE "community_builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"class" text DEFAULT '' NOT NULL,
	"subclass" text DEFAULT '' NOT NULL,
	"exotics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slot" text DEFAULT '' NOT NULL,
	"acquisition" text DEFAULT '' NOT NULL,
	"requires" text DEFAULT '' NOT NULL,
	"aspects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fragments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" text DEFAULT '' NOT NULL,
	"mods" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "community_builds_class_idx" ON "community_builds" USING btree ("class","subclass");