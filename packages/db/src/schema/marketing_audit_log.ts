import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const marketingAuditLog = pgTable(
  "marketing_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    action: text("action").notNull(),
    // "proposal.created" | "creative.generated" | "approval.submitted"
    // | "approval.approved" | "approval.rejected" | "campaign.published"
    // | "campaign.paused" | "cap.exceeded"
    userId: text("user_id"),       // operator who approved/rejected (nullable for agent actions)
    agentId: uuid("agent_id"),
    entityType: text("entity_type"), // "campaign_proposal" | "creative" | "approval"
    entityId: uuid("entity_id"),
    payloadDiff: jsonb("payload_diff").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("marketing_audit_log_company_created_idx").on(table.companyId, table.createdAt),
  }),
);
