/**
 * Unit tests for marketing.propose_campaign tool.
 * Mocks brief-generator and DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerProposeCampaignTool } from "../src/tools/propose-campaign.js";
import type { Db } from "@paperclipai/db";

// Mock brief-generator
const mockGenerateBrief = vi.fn();
vi.mock("../src/creative/brief-generator.js", () => ({
  generateBrief: (...args: unknown[]) => mockGenerateBrief(...args),
}));

const COMPANY_ID = "company-test";
const AGENT_ID = "agent-test";

const STUB_BRIEF = {
  positioning: "Premium fishing rods",
  tone: "professional",
  keyBenefits: ["lightweight"],
  hooks: ["Catch more"],
  doNots: ["cheap"],
};

const STUB_PROPOSAL = {
  id: "proposal-uuid-1",
  companyId: COMPANY_ID,
  platform: "meta",
  goal: "sales",
  status: "draft",
  productIds: ["p1"],
  budgetDailyPln: "100",
  durationDays: 14,
  audienceBrief: "fishing fans",
  briefJson: STUB_BRIEF,
  adSets: [],
  agentId: AGENT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  estimatedReach: null,
  platformCampaignId: null,
  rejectionReason: null,
  approvalId: null,
  publishedAt: null,
};

function buildMockDb() {
  const mockReturning = vi.fn().mockResolvedValue([STUB_PROPOSAL]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return {
    insert: mockInsert,
    _mockReturning: mockReturning,
    _mockValues: mockValues,
  } as unknown as Db & {
    _mockReturning: ReturnType<typeof vi.fn>;
    _mockValues: ReturnType<typeof vi.fn>;
  };
}

describe("marketing.propose_campaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a proposal and returns it", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");
    vi.spyOn(harness.ctx.companies, "get").mockResolvedValue(null);

    mockGenerateBrief.mockResolvedValueOnce(STUB_BRIEF);

    const db = buildMockDb();
    registerProposeCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.propose_campaign",
      {
        platform: "meta",
        goal: "sales",
        product_ids: ["p1"],
        budget_daily_pln: 100,
        duration_days: 14,
        audience_brief: "fishing fans",
      },
      { companyId: COMPANY_ID, agentId: AGENT_ID },
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/proposal-uuid-1/);
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("calls generateBrief with correct goal and brandKit from company", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");
    vi.spyOn(harness.ctx.companies, "get").mockResolvedValue({
      brandKitJson: { toneOfVoice: "friendly", doNots: ["darmowy"] },
    } as unknown as Parameters<typeof harness.ctx.companies.get>[0] extends string ? Awaited<ReturnType<typeof harness.ctx.companies.get>> : never);

    mockGenerateBrief.mockResolvedValueOnce(STUB_BRIEF);
    const db = buildMockDb();
    registerProposeCampaignTool(harness.ctx, db);

    await harness.executeTool(
      "marketing.propose_campaign",
      {
        platform: "google",
        goal: "awareness",
        product_ids: ["p2"],
        budget_daily_pln: 50,
        duration_days: 7,
      },
      { companyId: COMPANY_ID },
    );

    expect(mockGenerateBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "awareness",
        brandKit: expect.objectContaining({ toneOfVoice: "friendly" }),
      }),
    );
  });

  it("returns error on DB failure", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");
    vi.spyOn(harness.ctx.companies, "get").mockResolvedValue(null);
    mockGenerateBrief.mockResolvedValueOnce(STUB_BRIEF);

    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    });
    const db = { insert: vi.fn().mockReturnValue({ values: mockValues }) } as unknown as Db;
    registerProposeCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.propose_campaign",
      {
        platform: "meta",
        goal: "sales",
        product_ids: ["p1"],
        budget_daily_pln: 100,
        duration_days: 14,
      },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/DB connection lost/);
  });
});
