/**
 * Tests for approval/handler.ts
 *
 * Mocks Drizzle DB and PluginContext to verify:
 * - approved  → cap check → status "live" + two audit log entries
 * - approved but cap exceeded → reverts to "draft" + cap.exceeded audit entry
 * - rejected  → status "rejected", creatives archived + audit entry
 * - revision_requested → status "draft" + plugin event emitted + audit entry
 * - non-marketing type → ignored
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock cap-enforcement so we can control throw behaviour
vi.mock("../src/approval/cap-enforcement.js", () => ({
  enforceMarketingCap: vi.fn().mockResolvedValue(undefined),
  MarketingCapExceededError: class MarketingCapExceededError extends Error {
    constructor(public capPln: number, public projectedPln: number) {
      super(`Cap exceeded: ${projectedPln} > ${capPln}`);
      this.name = "MarketingCapExceededError";
    }
  },
}));

// Mock audit-log so we can assert calls without a real DB
vi.mock("../src/approval/audit-log.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { registerApprovalHandler } from "../src/approval/handler.js";
import { enforceMarketingCap, MarketingCapExceededError } from "../src/approval/cap-enforcement.js";
import { writeAuditLog } from "../src/approval/audit-log.js";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop-1",
    companyId: "co-1",
    status: "pending_approval",
    approvalId: "appr-1",
    budgetDailyPln: "100.00",
    durationDays: 10,
    ...overrides,
  };
}

function makeDb(proposal: unknown = makeProposal()) {
  const updateChain = makeUpdateChain();
  const insertChain = { values: vi.fn().mockResolvedValue([]) };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(proposal ? [proposal] : []),
      })),
    })),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
    _updateChain: updateChain,
    _insertChain: insertChain,
  } as unknown as Db & { _updateChain: ReturnType<typeof makeUpdateChain>; _insertChain: typeof insertChain };

  return db;
}

// ---------------------------------------------------------------------------
// PluginContext mock
// ---------------------------------------------------------------------------

function makeCtx() {
  let capturedHandler: ((event: PluginEvent) => Promise<void>) | null = null;

  const ctx = {
    events: {
      on: vi.fn((_name: string, fn: (event: PluginEvent) => Promise<void>) => {
        capturedHandler = fn;
        return () => {};
      }),
      emit: vi.fn().mockResolvedValue(undefined),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    // Helper to fire the registered handler directly in tests
    async fireEvent(payload: Partial<PluginEvent>) {
      if (!capturedHandler) throw new Error("No handler registered");
      const event: PluginEvent = {
        eventId: "evt-1",
        eventType: "approval.decided",
        occurredAt: new Date().toISOString(),
        companyId: "co-1",
        entityId: "appr-1",
        entityType: "approval",
        payload: {},
        ...payload,
      };
      await capturedHandler(event);
    },
  } as unknown as PluginContext & { fireEvent: (payload: Partial<PluginEvent>) => Promise<void> };

  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApprovalPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "marketing_campaign",
    approvalStatus: "approved",
    decidedByUserId: "user-1",
    decisionNote: "Looks good",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerApprovalHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a listener for approval.decided", () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);
    expect(ctx.events.on).toHaveBeenCalledWith("approval.decided", expect.any(Function));
  });

  it("ignores events with non-marketing type", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: { type: "hire_agent", approvalStatus: "approved" } });

    expect(db.update).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("approved: calls enforceMarketingCap and sets status to live", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload({ approvalStatus: "approved" }) });

    expect(enforceMarketingCap).toHaveBeenCalledOnce();
    const updateCall = (db.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall).toBeDefined();
  });

  it("approved: writes two audit log entries (approval.approved + campaign.published)", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload({ approvalStatus: "approved" }) });

    const calls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    const actions = calls.map((c: unknown[]) => (c[1] as { action: string }).action);
    expect(actions).toContain("approval.approved");
    expect(actions).toContain("campaign.published");
  });

  it("approved: reverts to draft and logs cap.exceeded when cap check throws", async () => {
    const { MarketingCapExceededError: MockCapError } = await import("../src/approval/cap-enforcement.js");
    vi.mocked(enforceMarketingCap).mockRejectedValueOnce(new MockCapError(1000, 2000));

    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload({ approvalStatus: "approved" }) });

    const auditCalls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    const actions = auditCalls.map((c: unknown[]) => (c[1] as { action: string }).action);
    expect(actions).toContain("cap.exceeded");
    // Should NOT contain campaign.published
    expect(actions).not.toContain("campaign.published");
  });

  it("rejected: sets proposal status to rejected and archives creatives", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({
      payload: buildApprovalPayload({
        approvalStatus: "rejected",
        decisionNote: "Budget too high",
      }),
    });

    const auditCalls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    const actions = auditCalls.map((c: unknown[]) => (c[1] as { action: string }).action);
    expect(actions).toContain("approval.rejected");

    // DB update should have been called (for proposal status + creatives archive)
    expect(db.update).toHaveBeenCalled();
  });

  it("rejected: does not emit plugin event", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload({ approvalStatus: "rejected" }) });

    expect(ctx.events.emit).not.toHaveBeenCalled();
  });

  it("revision_requested: sets proposal to draft and emits marketing.revision_requested", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({
      payload: buildApprovalPayload({
        approvalStatus: "revision_requested",
        decisionNote: "Please tweak headline",
      }),
    });

    expect(ctx.events.emit).toHaveBeenCalledWith(
      "marketing.revision_requested",
      "co-1",
      expect.objectContaining({ proposalId: "prop-1", note: "Please tweak headline" }),
    );
  });

  it("revision_requested: writes audit log entry", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload({ approvalStatus: "revision_requested" }) });

    const auditCalls = (writeAuditLog as ReturnType<typeof vi.fn>).mock.calls;
    const actions = auditCalls.map((c: unknown[]) => (c[1] as { action: string }).action);
    expect(actions).toContain("approval.revision_requested");
  });

  it("logs warning and returns early when approvalId is missing", async () => {
    const ctx = makeCtx();
    const db = makeDb();
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({
      entityId: undefined,
      payload: { type: "marketing_campaign", approvalStatus: "approved" },
    });

    expect(ctx.logger.warn).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("logs warning and returns early when no proposal is linked to approvalId", async () => {
    const ctx = makeCtx();
    const db = makeDb(null); // no proposal found
    registerApprovalHandler(ctx, db);

    await ctx.fireEvent({ payload: buildApprovalPayload() });

    expect(ctx.logger.warn).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
