ALTER TABLE "heartbeat_runs" ADD COLUMN "current_thought" text;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "current_tool" text;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "current_cost_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "current_thought_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "heartbeat_runs_company_status_started_idx" ON "heartbeat_runs" USING btree ("company_id","status","started_at");