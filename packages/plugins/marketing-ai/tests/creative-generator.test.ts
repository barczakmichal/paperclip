import { describe, it, expect, vi } from "vitest";
import { generateBrief } from "../src/creative/brief-generator.js";
import { generateCopy } from "../src/creative/copy-generator.js";
import { composeImage } from "../src/creative/image-composer.js";
import { validateCopyAgainstBrandKit } from "../src/creative/brand-validator.js";

// ---------------------------------------------------------------------------
// Shared Anthropic mock
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// ---------------------------------------------------------------------------
// Task 5: generateBrief
// ---------------------------------------------------------------------------

describe("generateBrief", () => {
  it("returns brief JSON with positioning, tone, hooks, doNots", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        positioning: "Premium fishing rods for serious anglers",
        tone: "authoritative, enthusiastic",
        hooks: ["Catch more with less effort"],
        doNots: ["darmowy"],
        keyBenefits: ["lightweight carbon fiber"],
      }) }],
    });

    const brief = await generateBrief({
      products: [{ id: "1", title: "Rod XL", price: "249", imageUrls: [], stock: 5 }],
      goal: "sales",
      audienceBrief: "fishing enthusiasts 25-45",
      brandKit: { toneOfVoice: "professional", doNots: ["darmowy"] },
      anthropicApiKey: "test-key",
    });

    expect(brief.positioning).toContain("fishing");
    expect(brief.doNots).toContain("darmowy");
  });

  it("throws on malformed LLM response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not JSON" }],
    });
    await expect(generateBrief({
      products: [],
      goal: "sales",
      audienceBrief: "",
      brandKit: {},
      anthropicApiKey: "test-key",
    })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Task 6: generateCopy
// ---------------------------------------------------------------------------

describe("generateCopy", () => {
  it("returns headlines, primary_texts, descriptions, cta for Meta", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        headlines: ["H1", "H2", "H3", "H4", "H5"],
        primaryTexts: ["T1", "T2", "T3"],
        descriptions: ["D1", "D2", "D3"],
        cta: "Shop Now",
      }) }],
    });

    const copy = await generateCopy({
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: ["darmowy"] },
      platform: "meta",
      headlineCount: 5,
      bodyCount: 3,
      anthropicApiKey: "test-key",
    });

    expect(copy.headlines).toHaveLength(5);
    expect(copy.primaryTexts).toHaveLength(3);
    expect(copy.cta).toBe("Shop Now");
  });

  it("rejects copy that contains doNots phrases", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        headlines: ["darmowy produkt", "H2", "H3", "H4", "H5"],
        primaryTexts: ["T1", "T2", "T3"],
        descriptions: ["D1", "D2", "D3"],
        cta: "Buy",
      }) }],
    });

    await expect(generateCopy({
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: ["darmowy"] },
      platform: "meta",
      anthropicApiKey: "test-key",
    })).rejects.toThrow(/do-not/i);
  });
});

// ---------------------------------------------------------------------------
// Task 7: composeImage
// ---------------------------------------------------------------------------

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    metadata: vi.fn().mockResolvedValue({ width: 300, height: 400 }),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("composeImage", () => {
  it("processes 1:1 format without calling OpenAI", async () => {
    const mockOpenAI = { images: { generate: vi.fn() } };
    const result = await composeImage({
      productImageUrl: "https://cdn.example.com/product.jpg",
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: [] },
      format: "1:1",
      outputPath: "/tmp/test-creative.jpg",
      openaiApiKey: "key",
      _openaiClient: mockOpenAI as unknown,
      _fetchFn: vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }),
    });

    expect(mockOpenAI.images.generate).not.toHaveBeenCalled();
    expect(result.path).toBe("/tmp/test-creative.jpg");
  });

  it("calls GPT-Image-1 for 1.91:1 banner format", async () => {
    const mockOpenAI = {
      images: {
        generate: vi.fn().mockResolvedValue({ data: [{ url: "https://oai.com/bg.jpg" }] }),
      },
    };
    await composeImage({
      productImageUrl: "https://cdn.example.com/product.jpg",
      brief: { positioning: "fishing rod ad", tone: "professional", keyBenefits: [], hooks: [], doNots: [] },
      format: "1.91:1",
      outputPath: "/tmp/test-banner.jpg",
      openaiApiKey: "key",
      _openaiClient: mockOpenAI as unknown,
      _fetchFn: vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }),
    });
    expect(mockOpenAI.images.generate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Task 8: validateCopyAgainstBrandKit
// ---------------------------------------------------------------------------

describe("validateCopyAgainstBrandKit", () => {
  const brandKit = { doNots: ["najtańszy", "gratis"] };

  it("passes clean copy", () => {
    expect(() => validateCopyAgainstBrandKit(["Great rods", "Buy now"], brandKit)).not.toThrow();
  });

  it("throws when copy contains forbidden phrase", () => {
    expect(() => validateCopyAgainstBrandKit(["najtańszy sprzęt na rynku"], brandKit))
      .toThrow(/najtańszy/);
  });

  it("is case-insensitive", () => {
    expect(() => validateCopyAgainstBrandKit(["GRATIS wysyłka"], brandKit))
      .toThrow(/gratis/i);
  });
});
