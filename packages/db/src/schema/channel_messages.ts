import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { channels } from "./channels.js";

export const channelMessages = pgTable(
  "channel_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id"),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("message"),
    body: text("body").notNull(),
    mentionedAgentIds: uuid("mentioned_agent_ids").array().notNull().default([]),
    triggeredRunId: uuid("triggered_run_id"),
    backingIssueCommentId: uuid("backing_issue_comment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    streamIdx: index("channel_messages_channel_created_idx").on(table.channelId, table.createdAt),
    backingCommentIdx: index("channel_messages_backing_comment_idx").on(table.backingIssueCommentId),
  }),
);
