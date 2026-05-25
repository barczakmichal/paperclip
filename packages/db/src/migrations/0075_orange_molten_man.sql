CREATE TABLE "campaign_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"platform" text NOT NULL,
	"goal" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_daily_pln" numeric(12, 2) NOT NULL,
	"duration_days" integer NOT NULL,
	"audience_brief" text,
	"estimated_reach" jsonb,
	"platform_campaign_id" text,
	"ad_sets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brief_json" jsonb,
	"rejection_reason" text,
	"approval_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"proposal_id" uuid,
	"format" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_url" text,
	"headlines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bodies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"descriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta" text,
	"brief_json" jsonb,
	"platform_asset_id" text,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"payload_diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_proposals" ADD CONSTRAINT "campaign_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_proposals" ADD CONSTRAINT "campaign_proposals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_proposal_id_campaign_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."campaign_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_audit_log" ADD CONSTRAINT "marketing_audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_proposals_company_status_idx" ON "campaign_proposals" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "creatives_proposal_idx" ON "creatives" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "creatives_company_status_idx" ON "creatives" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "marketing_audit_log_company_created_idx" ON "marketing_audit_log" USING btree ("company_id","created_at");