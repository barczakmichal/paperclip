/**
 * Unit tests for marketing.generate_creative tool.
 * Mocks DB selects/inserts, copy-generator, image-composer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerGenerateCreativeTool } from "../src/tools/generate-creative.js";
import type { Db } from "@paperclipai/db";

const COMPANY_ID = "company-test";
const PROPOSAL_ID = "proposal-uuid-1";

const STUB_PROPOSAL = {
  id: PROPOSAL_ID,
  companyId: COMPANY_ID,
  platform: "meta",
  briefJson: {
    positioning: "p",
    tone: "t",
    keyBenefits: [],
    hooks: [],
    doNots: [],
  },
  status: "draft",
};

const STUB_COPY = {
  headlines: ["H1", "H2", "H3"],
  primaryTexts: ["Body1"],
  descriptions: ["Desc1"],
  cta: "Shop Now",
};

const STUB_CREATIVE = {
  id: "creative-uuid-1",
  companyId: COMPANY_ID,
  proposalId: PROPOSAL_ID,
  format: "single_image",
  status: "complete",
  imageUrl: "file:///tmp/creative.jpg",
  headlines: STUB_COPY.headlines,
  bodies: STUB_COPY.primaryTexts,
  descriptions: STUB_COPY.descriptions,
  cta: "Shop Now",
};

const mockGenerateCopy = vi.fn();
const mockComposeImage = vi.fn();

vi.mock("../src/creative/copy-generator.js", () => ({
  generateCopy: (...args: unknown[]) => mockGenerateCopy(...args),
}));

vi.mock("../src/creative/image-composer.js", () => ({
  composeImage: (...args: unknown[]) => mockComposeImage(...args),
}));

function buildMockDb(proposalOverride?: Partial<typeof STUB_PROPOSAL>) {
  const proposal = { ...STUB_PROPOSAL, ...proposalOverride };

  // select chain: .select().from().where()
  const mockWhere = vi.fn().mockResolvedValue([proposal]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  // insert chain: .insert().values().returning()
  const mockReturning = vi.fn().mockResolvedValue([STUB_CREATIVE]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  return { select: mockSelect, insert: mockInsert } as unknown as Db;
}

describe("marketing.generate_creative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates copy and image, saves creative", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");

    mockGenerateCopy.mockResolvedValueOnce(STUB_COPY);
    mockComposeImage.mockResolvedValueOnce({ path: "/tmp/creative.jpg", width: 1200, height: 628, usedGenAI: true });

    const db = buildMockDb();
    registerGenerateCreativeTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.generate_creative",
      { proposal_id: PROPOSAL_ID, format: "single_image" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toMatch(/creative-uuid-1/);
    expect(mockGenerateCopy).toHaveBeenCalledOnce();
    expect(mockComposeImage).toHaveBeenCalledOnce();
  });

  it("returns error when proposal not found", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const db = { select: mockSelect, insert: vi.fn() } as unknown as Db;

    registerGenerateCreativeTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.generate_creative",
      { proposal_id: "nonexistent", format: "single_image" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/Proposal not found/);
  });

  it("returns error when proposal belongs to different company", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");

    const db = buildMockDb({ companyId: "other-company" });
    registerGenerateCreativeTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.generate_creative",
      { proposal_id: PROPOSAL_ID, format: "single_image" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toMatch(/not in current company/);
  });

  it("saves creative as incomplete when image composition fails", async () => {
    const harness = createTestHarness({ manifest });
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-key");

    mockGenerateCopy.mockResolvedValueOnce(STUB_COPY);
    mockComposeImage.mockRejectedValueOnce(new Error("sharp error"));

    const mockReturning = vi.fn().mockResolvedValue([
      { ...STUB_CREATIVE, status: "incomplete", errorDetail: "sharp error" },
    ]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    const mockWhere = vi.fn().mockResolvedValue([STUB_PROPOSAL]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const db = { select: mockSelect, insert: mockInsert } as unknown as Db;

    registerGenerateCreativeTool(harness.ctx, db);

    const result = await harness.executeTool(
      "marketing.generate_creative",
      { proposal_id: PROPOSAL_ID, format: "single_image" },
      { companyId: COMPANY_ID },
    );

    expect(result.error).toBeUndefined();
    // Insert should still be called with incomplete status
    expect(mockInsert).toHaveBeenCalledOnce();
    const insertValues = mockValues.mock.calls[0][0] as { status: string };
    expect(insertValues.status).toBe("incomplete");
  });
});
