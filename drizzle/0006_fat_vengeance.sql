CREATE TABLE "sheet_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(120) NOT NULL,
	"tab" text NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"row" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sheet_rows_source_tab_idx" ON "sheet_rows" USING btree ("source","tab");