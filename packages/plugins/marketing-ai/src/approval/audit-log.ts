/**
 * audit-log.ts — thin helper that writes a row to `marketing_audit_log`.
 *
 * Every marketing-AI action (proposal created, campaign published, cap exceeded,
 * approval approved/rejected, revision requested) calls `writeAuditLog` so
 * there is a durable, queryable trail of every event.
 */

import { marketingAuditLog } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

export interface AuditLogEntry {
  companyId: string;
  action: string;
  entityId: string;
  entityType?: string;
  userId?: string;
  agentId?: string;
  payloadDiff?: Record<string, unknown>;
}

/**
 * Insert one row into `marketing_audit_log`.
 *
 * Fire-and-forget is intentional for most callers — awaiting is optional.
 * Always await when the caller needs to guarantee persistence (e.g. tests).
 */
export async function writeAuditLog(db: Db, entry: AuditLogEntry): Promise<void> {
  await db.insert(marketingAuditLog).values({
    companyId: entry.companyId,
    action: entry.action,
    userId: entry.userId ?? null,
    agentId: entry.agentId ?? null,
    entityType: entry.entityType ?? "campaign_proposal",
    entityId: entry.entityId,
    payloadDiff: entry.payloadDiff ?? {},
  });
}
