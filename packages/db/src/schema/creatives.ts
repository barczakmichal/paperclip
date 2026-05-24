import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { campaignProposals } from "./campaign_proposals.js";

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    proposalId: uuid("proposal_id").references(() => campaignProposals.id),
    format: text("format").notNull(), // "single_image" | "carousel"
    status: text("status").notNull().default("pending"),
    // "pending" | "complete" | "incomplete" | "archived"
    imageUrl: text("image_url"),
    headlines: jsonb("headlines").$type<string[]>().notNull().default([]),
    bodies: jsonb("bodies").$type<string[]>().notNull().default([]),
    descriptions: jsonb("descriptions").$type<string[]>().notNull().default([]),
    cta: text("cta"),
    briefJson: jsonb("brief_json").$type<Record<string, unknown>>(),
    platformAssetId: text("platform_asset_id"), // set after upload to Meta/Google
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    proposalIdx: index("creatives_proposal_idx").on(table.proposalId),
    companyStatusIdx: index("creatives_company_status_idx").on(table.companyId, table.status),
  }),
);
