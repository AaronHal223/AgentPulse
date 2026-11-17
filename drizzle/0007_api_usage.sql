CREATE TABLE "api_usage" (
	"service" text NOT NULL,
	"month" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_service_month_pk" PRIMARY KEY("service","month")
);
