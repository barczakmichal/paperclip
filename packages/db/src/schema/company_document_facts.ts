import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const companyDocumentFacts = pgTable(
  "company_document_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    documentKey: text("document_key").notNull(),
    factKey: text("fact_key").notNull(),
    value: text("value").notNull(),
    updatedByAgentId: uuid("updated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyDocumentFactUq: uniqueIndex("company_document_facts_company_key_fact_uq").on(
      table.companyId,
      table.documentKey,
      table.factKey,
    ),
  }),
);
