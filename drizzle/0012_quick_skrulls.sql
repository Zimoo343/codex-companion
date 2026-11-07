ALTER TABLE "expansions" ADD COLUMN "bundle" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expansions" ADD COLUMN "includes" jsonb DEFAULT '[]'::jsonb NOT NULL;