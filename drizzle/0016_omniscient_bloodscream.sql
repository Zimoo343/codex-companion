CREATE TABLE "milestones" (
	"hash" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"type" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_groups" (
	"hash" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
