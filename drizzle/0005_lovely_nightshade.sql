CREATE TABLE "rate_limits" (
	"ip" varchar(64) NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_ip_day_pk" PRIMARY KEY("ip","day")
);
