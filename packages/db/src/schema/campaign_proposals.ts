import { pgTable, uuid, text, timestamp, jsonb, numeric, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const campaignProposals = pgTable(
  "campaign_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id),
    platform: text("platform").notNull(), // "meta" | "google"
    goal: text("goal").notNull(),         // "sales" | "awareness" | "leads"
    status: text("status").notNull().default("draft"),
    // "draft" | "pending_approval" | "approved" | "live" | "paused" | "rejected" | "rejected_by_platform" | "expired"
    productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
    budgetDailyPln: numeric("budget_daily_pln", { precision: 12, scale: 2 }).notNull(),
    durationDays: integer("duration_days").notNull(),
    audienceBrief: text("audience_brief"),
    estimatedReach: jsonb("estimated_reach").$type<Record<string, unknown>>(),
    platformCampaignId: text("platform_campaign_id"), // set after publish
    adSets: jsonb("ad_sets").$type<unknown[]>().notNull().default([]),
    briefJson: jsonb("brief_json").$type<Record<string, unknown>>(),
    rejectionReason: text("rejection_reason"),
    approvalId: uuid("approval_id"),   // FK to core approvals table (loose, no FK constraint — avoids cross-schema issues)
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("campaign_proposals_company_status_idx").on(table.companyId, table.status),
  }),
);
