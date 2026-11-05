CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"light_level" integer DEFAULT 0 NOT NULL,
	"is_pvp" boolean DEFAULT false NOT NULL,
	"variants" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "activities_type_name" UNIQUE("type","name")
);
--> statement-breakpoint
CREATE TABLE "aegis_archetypes" (
	"id" serial PRIMARY KEY NOT NULL,
	"weapon" text NOT NULL,
	"frame" text DEFAULT '' NOT NULL,
	"ammo" text DEFAULT '' NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	"one_mag_bdps" integer,
	"typical_bdps" integer,
	"max_bdps" integer,
	"row" jsonb NOT NULL,
	CONSTRAINT "aegis_archetypes_weapon_frame" UNIQUE("weapon","frame")
);
--> statement-breakpoint
CREATE TABLE "aegis_weapons" (
	"id" serial PRIMARY KEY NOT NULL,
	"tab" text NOT NULL,
	"name" text NOT NULL,
	"season" text DEFAULT '' NOT NULL,
	"energy" text DEFAULT '' NOT NULL,
	"frame" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"ammo" text DEFAULT '' NOT NULL,
	"barrel" text DEFAULT '' NOT NULL,
	"magazine" text DEFAULT '' NOT NULL,
	"masterwork" text DEFAULT '' NOT NULL,
	"perk1" text DEFAULT '' NOT NULL,
	"perk2" text DEFAULT '' NOT NULL,
	"origin_trait" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	CONSTRAINT "aegis_weapons_tab_name" UNIQUE("tab","name")
);
--> statement-breakpoint
CREATE TABLE "armor" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slot" text DEFAULT '' NOT NULL,
	"class" text DEFAULT '' NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"perks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "armor_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"url" text NOT NULL,
	"answers" text NOT NULL,
	"recommend_when" text NOT NULL,
	"last_reviewed" varchar(10) DEFAULT '' NOT NULL,
	CONSTRAINT "external_tools_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"url" text NOT NULL,
	"credit" text DEFAULT '' NOT NULL,
	"license_note" text DEFAULT '' NOT NULL,
	"last_fetched_at" timestamp with time zone,
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subclass_plugs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"class" text DEFAULT 'shared' NOT NULL,
	"element" text DEFAULT '' NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "subclass_plugs_name_kind" UNIQUE("name","kind")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(40) NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"status" varchar(20) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"hash" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	"damage_type" text DEFAULT '' NOT NULL,
	"frame" text DEFAULT '' NOT NULL,
	"ammo_type" text DEFAULT '' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"perks" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activities_type_idx" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "aegis_archetypes_tier_idx" ON "aegis_archetypes" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "aegis_weapons_name_idx" ON "aegis_weapons" USING btree ("name");--> statement-breakpoint
CREATE INDEX "armor_class_idx" ON "armor" USING btree ("class");--> statement-breakpoint
CREATE INDEX "subclass_plugs_kind_idx" ON "subclass_plugs" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_started" ON "sync_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "weapons_name_idx" ON "weapons" USING btree ("name");