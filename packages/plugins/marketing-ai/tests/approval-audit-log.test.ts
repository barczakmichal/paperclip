/**
 * Tests for approval/audit-log.ts
 */
import { describe, it, expect, vi } from "vitest";
import { writeAuditLog } from "../src/approval/audit-log.js";
import type { Db } from "@paperclipai/db";

function makeDb() {
  const valuesChain = { values: vi.fn().mockResolvedValue([]) };
  const db = {
    insert: vi.fn(() => valuesChain),
    _valuesChain: valuesChain,
  } as unknown as Db & { _valuesChain: typeof valuesChain };
  return db;
}

describe("writeAuditLog", () => {
  it("inserts one row with required fields", async () => {
    const db = makeDb();

    await writeAuditLog(db, {
      companyId: "co-1",
      action: "campaign.published",
      entityId: "prop-1",
    });

    expect(db.insert).toHaveBeenCalledOnce();
    const insertArg = (db._valuesChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg).toMatchObject({
      companyId: "co-1",
      action: "campaign.published",
      entityId: "prop-1",
    });
  });

  it("sets entityType to campaign_proposal by default", async () => {
    const db = makeDb();

    await writeAuditLog(db, {
      companyId: "co-1",
      action: "approval.approved",
      entityId: "prop-1",
    });

    const insertArg = (db._valuesChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.entityType).toBe("campaign_proposal");
  });

  it("passes through optional userId, agentId, payloadDiff", async () => {
    const db = makeDb();

    await writeAuditLog(db, {
      companyId: "co-1",
      action: "cap.exceeded",
      entityId: "prop-1",
      userId: "user-42",
      agentId: "agent-7",
      payloadDiff: { error: "Cap exceeded" },
    });

    const insertArg = (db._valuesChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.userId).toBe("user-42");
    expect(insertArg.agentId).toBe("agent-7");
    expect(insertArg.payloadDiff).toEqual({ error: "Cap exceeded" });
  });

  it("uses empty object when payloadDiff is not provided", async () => {
    const db = makeDb();

    await writeAuditLog(db, {
      companyId: "co-1",
      action: "approval.rejected",
      entityId: "prop-1",
    });

    const insertArg = (db._valuesChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertArg.payloadDiff).toEqual({});
  });

  it("resolves without throwing on success", async () => {
    const db = makeDb();
    await expect(
      writeAuditLog(db, { companyId: "c", action: "approval.approved", entityId: "e" }),
    ).resolves.toBeUndefined();
  });

  it("propagates DB errors", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn().mockRejectedValue(new Error("DB down")),
      })),
    } as unknown as Db;

    await expect(
      writeAuditLog(db, { companyId: "c", action: "x", entityId: "e" }),
    ).rejects.toThrow("DB down");
  });
});
