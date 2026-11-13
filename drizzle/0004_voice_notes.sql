CREATE TABLE "voice_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"transcript" text NOT NULL,
	"proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_notes_buyer_idx" ON "voice_notes" USING btree ("buyer_id");