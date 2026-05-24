/**
 * Unit tests for marketing.submit_for_approval tool.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerSubmitForApprovalTool } from "../src/tools/submit-for-approval.js";
import type { Db } from "@paperclipai/db";

const COMPANY_ID = "company-test";
const PROPOSAL_ID = "proposal-uuid-1";
const APPROVAL_ID = "approval-uuid-1";

const STUB_PROPOSAL = {
  id: PROPOSAL_ID,
  companyId: COMPANY_ID,
  platform: "meta",
  goal: "sales",
  status: "draft",
  budgetDailyPln: "100",
  durationDays: 14,
  audienceBrief: "fishing fans",
};

const STUB_APPROVAL = {
  id: APPROVAL_ID,
  companyId: COMPANY_ID,
  type: "marketing_campaign",
  status: "pending",
};

function buildMockDb(proposalOverride?: Partial<typeof STUB_PROPOSAL>) {
  const proposal = { ...STUB_PROPOSAL, ...proposalOverride };

  // select().from().where() → proposal
  const mockWhereSelect = vi.fn().mockResolvedValue([proposal]);
  const mockFromSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFromSelect });

  // insert().values().returning() — approvals and then campaignProposals update
  const mockReturningApproval = vi.fn().mockResolvedValue([STUB_APPROVAL]);
  const mockValuesApproval = vi.fn().mockReturnValue({ returning: mockReturningApproval });
  const mockInsertApproval = vi.fn().mockReturnValue({ values: mockValuesApproval });

  // update().set().where()
  const mockWhereUpdate = vi.fn().mockResolvedValue([]);
  const mockSetUpdate = vi.fn().mockReturnValue({ where: mockWhereUpdate });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSetUpdate });

  let insertCallCount = 0;
  const mockInsert = vi.fn().mockImplementation(() => {
    insertCallCount++;
    return { values: mockValuesApproval };
  });

  return {
    db: { select: mockSelect, insert: mockInsert, update: mockUpdate } as unknown as Db,
    mocks: { mockInsert, mockUpdate, mockWhereUpdate },
  };
}

describe("marketing.submit_for_approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates approval row and updates proposal status", async () => {
    const harness = createTestHarness({ manifest });
    const { db, mocks } = buildMockDb();
    registerSubmitForApprovalTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.submit_for_approval",
      {
        proposal_id: PROPOSAL_ID,
        creative_ids: ["creative-1"],
        comments: "Looks good",
      },
      { companyId: COMPANY_ID, agentId: "agent-1" },
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/approval-uuid-1/);
    expect(mocks.mockInsert).toHaveBeenCalledOnce();
    expect(mocks.mockUpdate).toHaveBeenCalledOnce();
  });

  it("returns error when proposal not found", async () => {
    const harness = createTestHarness({ manifest });

    const mockWhereSelect = vi.fn().mockResolvedValue([]);
    const mockFromSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFromSelect });
    const db = { select: mockSelect, insert: vi.fn(), update: vi.fn() } as unknown as Db;

    registerSubmitForApprovalTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.submit_for_approval",
      { proposal_id: "nonexistent", creative_ids: ["c1"] },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/Proposal not found/);
  });

  it("returns error when proposal belongs to different company", async () => {
    const harness = createTestHarness({ manifest });
    const { db } = buildMockDb({ companyId: "other-company" });
    registerSubmitForApprovalTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.submit_for_approval",
      { proposal_id: PROPOSAL_ID, creative_ids: ["c1"] },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/not in current company/);
  });

  it("stores approval payload with platform and budget snapshot", async () => {
    const harness = createTestHarness({ manifest });
    const { db, mocks } = buildMockDb();
    registerSubmitForApprovalTool(harness.ctx, db);

    await harness.executeTool(
      "marketing.submit_for_approval",
      { proposal_id: PROPOSAL_ID, creative_ids: ["creative-1"] },
      { companyId: COMPANY_ID },
    );

    const insertArgs = (mocks.mockInsert.mock.results[0] as { value: { values: ReturnType<typeof vi.fn> } }).value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArgs.type).toBe("marketing_campaign");
    expect(insertArgs.status).toBe("pending");
    const payload = insertArgs.payload as Record<string, unknown>;
    expect(payload.platform).toBe("meta");
    expect(payload.proposalId).toBe(PROPOSAL_ID);
  });
});
