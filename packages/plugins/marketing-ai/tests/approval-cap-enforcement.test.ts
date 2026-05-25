/**
 * Tests for cap-enforcement.ts
 *
 * Uses a minimal Drizzle mock so no real DB is needed.
 *
 * The enforceMarketingCap function makes three db.select() calls in order:
 *   1. companies table  — returns [company]
 *   2. campaignProposals table (active campaigns) — returns array
 *   3. campaignProposals table (proposal being approved) — returns [proposal]
 *
 * The mock returns each call's result in sequence using a call-count queue.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforceMarketingCap, MarketingCapExceededError } from "../src/approval/cap-enforcement.js";
import type { Db } from "@paperclipai/db";

// ---------------------------------------------------------------------------
// DB mock factory — returns rows in queue order per select().from().where() call
// ---------------------------------------------------------------------------

function makeDb(...resultQueue: unknown[][]) {
  let callIndex = 0;

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = resultQueue[callIndex] ?? [];
          callIndex++;
          return Promise.resolve(rows);
        }),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })),
  } as unknown as Db;

  return db;
}

// ---------------------------------------------------------------------------
// Row factories
// ---------------------------------------------------------------------------

function fakeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: "company-1",
    marketingMonthlyCaplPln: "10000.00",
    ...overrides,
  };
}

function fakeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    companyId: "company-1",
    status: "live",
    budgetDailyPln: "100.00",
    durationDays: 30,
    ...overrides,
  };
}

function fakeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal-new",
    companyId: "company-1",
    status: "pending_approval",
    budgetDailyPln: "200.00",
    durationDays: 10,
    ...overrides,
  };
}

const noOpFetchMetrics = async (_id: string) => ({ spendPln: 0 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enforceMarketingCap", () => {
  it("passes when no cap is configured (null)", async () => {
    // Queue: [company (null cap)], [active campaigns], [proposal]
    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: null })],
      [],
      [],
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      }),
    ).resolves.toBeUndefined();
  });

  it("passes when no cap is configured (zero)", async () => {
    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: "0" })],
      [],
      [],
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when company is not found", async () => {
    const db = makeDb(
      [], // company — empty
      [],
      [],
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "missing",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      }),
    ).rejects.toThrow("Company not found");
  });

  it("passes when projected spend is within cap", async () => {
    // cap = 10 000 PLN
    // one live campaign: 100 PLN/day × (up to 30 remaining days max) = some amount
    // proposal: 200 PLN/day × (up to 10 days remaining) = some amount
    // total well under 10 000 — should pass

    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: "10000.00" })], // companies
      [fakeCampaign({ id: "live-1", status: "live", budgetDailyPln: "10.00", durationDays: 30 })], // active campaigns
      [fakeProposal({ id: "proposal-new", status: "pending_approval", budgetDailyPln: "10.00", durationDays: 5 })], // proposal
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws MarketingCapExceededError when projected spend exceeds cap", async () => {
    // cap = 50 PLN (very small)
    // live campaign: 1000 PLN/day × many days = way over cap

    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: "50.00" })],
      [fakeCampaign({ id: "c1", status: "live", budgetDailyPln: "1000.00", durationDays: 30 })],
      [fakeProposal({ id: "proposal-new", budgetDailyPln: "100.00", durationDays: 10 })],
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      }),
    ).rejects.toThrow(MarketingCapExceededError);
  });

  it("MarketingCapExceededError has correct capPln and projectedPln properties", async () => {
    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: "100.00" })],
      [fakeCampaign({ id: "c1", status: "live", budgetDailyPln: "1000.00", durationDays: 30 })],
      [fakeProposal({ id: "proposal-new", budgetDailyPln: "0.00", durationDays: 1 })],
    );

    let caughtError: MarketingCapExceededError | undefined;
    try {
      await enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: noOpFetchMetrics,
      });
    } catch (err) {
      if (err instanceof MarketingCapExceededError) caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(MarketingCapExceededError);
    expect(caughtError?.capPln).toBe(100);
    expect(caughtError?.projectedPln).toBeGreaterThan(100);
    expect(caughtError?.name).toBe("MarketingCapExceededError");
  });

  it("uses conservative fallback when fetchMetricsFn throws (spentMtd > cap alone)", async () => {
    // cap = 5 PLN (tiny)
    // live campaign: 100 PLN/day — fetchMetrics throws
    // fallback = 100 × daysElapsed (at least 1 day) = at least 100 PLN >> 5 PLN => throw

    const db = makeDb(
      [fakeCompany({ marketingMonthlyCaplPln: "5.00" })],
      [fakeCampaign({ id: "c1", status: "live", budgetDailyPln: "100.00", durationDays: 30 })],
      [fakeProposal({ id: "proposal-new", budgetDailyPln: "0.00", durationDays: 1 })],
    );

    await expect(
      enforceMarketingCap(db, {
        companyId: "company-1",
        proposalId: "proposal-new",
        fetchMetricsFn: async (_id) => {
          throw new Error("metrics unavailable");
        },
      }),
    ).rejects.toThrow(MarketingCapExceededError);
  });
});
