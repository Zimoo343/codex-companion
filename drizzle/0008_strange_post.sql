CREATE TABLE "builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"class" text NOT NULL,
	"rank" integer NOT NULL,
	"exotic_combo" text DEFAULT '' NOT NULL,
	"super" text DEFAULT '' NOT NULL,
	"abilities" text DEFAULT '' NOT NULL,
	"aspects" text DEFAULT '' NOT NULL,
	"fragments" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'AegisRelic class items' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_item_combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"class" text NOT NULL,
	"trait_one" text NOT NULL,
	"trait_two" text NOT NULL,
	"source" text DEFAULT 'AegisRelic class items' NOT NULL,
	CONSTRAINT "class_item_combos_unique" UNIQUE("class","trait_one","trait_two")
);
--> statement-breakpoint
CREATE INDEX "class_item_combos_class_idx" ON "class_item_combos" USING btree ("class");