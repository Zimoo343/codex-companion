CREATE TABLE "expansions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	"subclasses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "expansions_name_unique" UNIQUE("name")
);
