CREATE TABLE "match_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"source" text NOT NULL,
	"verdict" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "base_score" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_feedback_match_source_idx" ON "match_feedback" USING btree ("match_id","source");--> statement-breakpoint
CREATE INDEX "match_feedback_buyer_idx" ON "match_feedback" USING btree ("buyer_id");--> statement-breakpoint
-- Homes the agent already saved or dismissed count as feedback from day one.
INSERT INTO "match_feedback" ("id", "match_id", "buyer_id", "source", "verdict")
SELECT gen_random_uuid()::text, "id", "buyer_id", 'agent', CASE "status" WHEN 'saved' THEN 'saved' ELSE 'rejected' END
FROM "matches" WHERE "status" IN ('saved', 'dismissed')
ON CONFLICT DO NOTHING;
