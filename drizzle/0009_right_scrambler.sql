CREATE TABLE "armor_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"pieces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bonuses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "armor_sets_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE INDEX "armor_sets_name_idx" ON "armor_sets" USING btree ("name");