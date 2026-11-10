CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"match_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"briefed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "listing_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_agent_created_idx" ON "alerts" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_agent_idx" ON "push_subscriptions" USING btree ("agent_id");