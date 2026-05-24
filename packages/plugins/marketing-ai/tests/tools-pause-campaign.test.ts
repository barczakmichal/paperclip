/**
 * Unit tests for marketing.pause_campaign tool.
 * Mocks DB update and audit log insert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerPauseCampaignTool } from "../src/tools/pause-campaign.js";
import type { Db } from "@paperclipai/db";

const COMPANY_ID = "company-test";
const CAMPAIGN_ID = "proposal-uuid-1";

const STUB_PROPOSAL = {
  id: CAMPAIGN_ID,
  companyId: COMPANY_ID,
  platform: "meta",
  status: "live",
  platformCampaignId: "meta-camp-123",
};

function buildMockDb(proposalOverride?: Partial<typeof STUB_PROPOSAL>) {
  const proposal = { ...STUB_PROPOSAL, ...proposalOverride };

  // select chain
  const mockWhereSelect = vi.fn().mockResolvedValue([proposal]);
  const mockFromSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFromSelect });

  // update chain
  const mockWhereUpdate = vi.fn().mockResolvedValue([]);
  const mockSetUpdate = vi.fn().mockReturnValue({ where: mockWhereUpdate });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSetUpdate });

  // insert chain (audit log)
  const mockValuesInsert = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValuesInsert });

  return {
    db: { select: mockSelect, update: mockUpdate, insert: mockInsert } as unknown as Db,
    mocks: { mockUpdate, mockInsert, mockValuesInsert },
  };
}

describe("marketing.pause_campaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status to paused and writes audit log", async () => {
    const harness = createTestHarness({ manifest });
    const { db, mocks } = buildMockDb();
    registerPauseCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.pause_campaign",
      { campaign_id: CAMPAIGN_ID, reason: "Budget depleted" },
      { companyId: COMPANY_ID, agentId: "agent-1" },
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/paused/);
    expect(mocks.mockUpdate).toHaveBeenCalledOnce();
    expect(mocks.mockInsert).toHaveBeenCalledOnce();
  });

  it("writes correct action to audit log", async () => {
    const harness = createTestHarness({ manifest });
    const { db, mocks } = buildMockDb();
    registerPauseCampaignTool(harness.ctx, db);

    await harness.executeTool(
      "marketing.pause_campaign",
      { campaign_id: CAMPAIGN_ID, reason: "Test pause" },
      { companyId: COMPANY_ID, agentId: "agent-1" },
    );

    const auditLogPayload = (mocks.mockValuesInsert.mock.calls[0] as [Record<string, unknown>])[0];
    expect(auditLogPayload.action).toBe("campaign.paused");
    expect(auditLogPayload.entityId).toBe(CAMPAIGN_ID);
    expect((auditLogPayload.payloadDiff as Record<string, unknown>).reason).toBe("Test pause");
    expect((auditLogPayload.payloadDiff as Record<string, unknown>).previousStatus).toBe("live");
  });

  it("returns error when campaign not found", async () => {
    const harness = createTestHarness({ manifest });
    const mockWhere = vi.fn().mockResolvedValue([]);
    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) }),
      update: vi.fn(),
      insert: vi.fn(),
    } as unknown as Db;

    registerPauseCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.pause_campaign",
      { campaign_id: "nonexistent", reason: "test" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/Campaign not found/);
  });

  it("returns error when campaign not yet published on platform", async () => {
    const harness = createTestHarness({ manifest });
    const { db } = buildMockDb({ platformCampaignId: null as unknown as string });
    registerPauseCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.pause_campaign",
      { campaign_id: CAMPAIGN_ID, reason: "test" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/not yet published/);
  });

  it("returns error when campaign belongs to different company", async () => {
    const harness = createTestHarness({ manifest });
    const { db } = buildMockDb({ companyId: "other-company" });
    registerPauseCampaignTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.pause_campaign",
      { campaign_id: CAMPAIGN_ID, reason: "test" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/not in current company/);
  });
});
