CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"brokerage" text,
	"market_area" text,
	"brief_email" text,
	"brief_enabled" boolean DEFAULT true NOT NULL,
	"last_brief_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"intent" text DEFAULT 'buy' NOT NULL,
	"budget_min" integer,
	"budget_max" integer,
	"beds_min" real,
	"baths_min" real,
	"sqft_min" integer,
	"property_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anchors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_drive_minutes" integer,
	"must_haves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nice_to_haves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deal_breakers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline" text,
	"notes" text,
	"ai_summary" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_searched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"listing_type" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"price" integer,
	"beds" real,
	"baths" real,
	"sqft" integer,
	"property_type" text,
	"summary" text,
	"blurb" text,
	"score" integer NOT NULL,
	"reasoning" text,
	"pros" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_area" boolean DEFAULT true NOT NULL,
	"area_note" text,
	"lat" real,
	"lng" real,
	"distances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"origin" text DEFAULT 'search' NOT NULL,
	"briefed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buyers_agent_idx" ON "buyers" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_buyer_url_idx" ON "matches" USING btree ("buyer_id","url");--> statement-breakpoint
CREATE INDEX "matches_buyer_idx" ON "matches" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "messages_buyer_idx" ON "messages" USING btree ("buyer_id");