/**
 * Unit tests for marketing.fetch_metrics tool.
 * Mocks DB and NBP currency conversion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerFetchMetricsTool } from "../src/tools/fetch-metrics.js";
import type { Db } from "@paperclipai/db";

const COMPANY_ID = "company-test";
const CAMPAIGN_ID = "proposal-uuid-1";

const STUB_PROPOSAL = {
  id: CAMPAIGN_ID,
  companyId: COMPANY_ID,
  platform: "meta",
  platformCampaignId: "meta-camp-123",
};

// Mock NBP adapter
const mockConvertToPln = vi.fn();
vi.mock("../src/adapters/nbp.js", () => ({
  convertToPln: (...args: unknown[]) => mockConvertToPln(...args),
  getPlnRate: vi.fn().mockResolvedValue(4.0),
}));

function buildMockDb(proposalOverride?: Partial<typeof STUB_PROPOSAL>) {
  const proposal = { ...STUB_PROPOSAL, ...proposalOverride };
  const mockWhere = vi.fn().mockResolvedValue([proposal]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { select: mockSelect } as unknown as Db;
}

describe("marketing.fetch_metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvertToPln.mockResolvedValue(0); // default: 0 spend
  });

  it("returns normalized PLN metrics for a campaign", async () => {
    const harness = createTestHarness({ manifest });
    mockConvertToPln.mockResolvedValue(0);

    const db = buildMockDb();
    registerFetchMetricsTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.fetch_metrics",
      { campaign_id: CAMPAIGN_ID },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toBeUndefined();
    const data = result.data as Record<string, unknown>;
    expect(data.campaign_id).toBe(CAMPAIGN_ID);
    expect(data.platform).toBe("meta");
    expect(typeof data.spend_pln).toBe("number");
    expect(typeof data.roas).toBe("number");
    expect(typeof data.ctr).toBe("number");
  });

  it("uses provided since/until date range", async () => {
    const harness = createTestHarness({ manifest });
    mockConvertToPln.mockResolvedValue(0);
    const db = buildMockDb();
    registerFetchMetricsTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.fetch_metrics",
      { campaign_id: CAMPAIGN_ID, since: "2026-01-01", until: "2026-01-31" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toBeUndefined();
    const data = result.data as Record<string, unknown>;
    expect(data.since).toBe("2026-01-01");
    expect(data.until).toBe("2026-01-31");
  });

  it("returns error when campaign not found", async () => {
    const harness = createTestHarness({ manifest });
    const mockWhere = vi.fn().mockResolvedValue([]);
    const db = { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) }) } as unknown as Db;

    registerFetchMetricsTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.fetch_metrics",
      { campaign_id: "nonexistent" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/Campaign not found/);
  });

  it("returns error when campaign belongs to different company", async () => {
    const harness = createTestHarness({ manifest });
    const db = buildMockDb({ companyId: "other-company" });
    registerFetchMetricsTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.fetch_metrics",
      { campaign_id: CAMPAIGN_ID },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/not in current company/);
  });

  it("returns error when NBP call fails", async () => {
    const harness = createTestHarness({ manifest });
    mockConvertToPln.mockRejectedValueOnce(new Error("NBP unreachable"));
    const db = buildMockDb();
    registerFetchMetricsTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.fetch_metrics",
      { campaign_id: CAMPAIGN_ID },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/NBP unreachable/);
  });
});
