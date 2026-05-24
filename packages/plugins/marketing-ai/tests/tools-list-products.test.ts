/**
 * Unit tests for marketing.list_products tool.
 * Mocks the Shopify catalog and ctx.secrets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import { registerListProductsTool } from "../src/tools/list-products.js";

// Mock the shop-catalog module
const mockListProducts = vi.fn();
vi.mock("../src/creative/shop-catalog.js", () => ({
  createShopifyCatalog: vi.fn(() => ({ listProducts: mockListProducts })),
}));

function buildCtx() {
  const harness = createTestHarness({ manifest });
  // Override secrets to return predictable values
  vi.spyOn(harness.ctx.secrets, "resolve").mockImplementation(async (ref) => `resolved:${ref}`);
  return harness;
}

describe("marketing.list_products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns products from shop catalog", async () => {
    const harness = buildCtx();
    registerListProductsTool(harness.ctx);

    mockListProducts.mockResolvedValueOnce([
      { id: "1", title: "Rod XL", price: "249.99", imageUrls: ["https://cdn.example.com/rod.jpg"], stock: 10 },
    ]);

    const result = await harness.executeTool("marketing.list_products", {});
    expect(result.error).toBeUndefined();
    expect((result.data as { products: unknown[] }).products).toHaveLength(1);
    expect((result.data as { products: Array<{ id: string }> }).products[0]!.id).toBe("1");
  });

  it("applies limit capped at 200", async () => {
    const harness = buildCtx();
    registerListProductsTool(harness.ctx);
    mockListProducts.mockResolvedValueOnce([]);

    await harness.executeTool("marketing.list_products", { limit: 999 });
    expect(mockListProducts).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });

  it("passes category filter to catalog", async () => {
    const harness = buildCtx();
    registerListProductsTool(harness.ctx);
    mockListProducts.mockResolvedValueOnce([]);

    await harness.executeTool("marketing.list_products", { category: "rods" });
    expect(mockListProducts).toHaveBeenCalledWith(
      expect.objectContaining({ category: "rods" }),
    );
  });

  it("returns error when shop catalog throws", async () => {
    const harness = buildCtx();
    registerListProductsTool(harness.ctx);
    mockListProducts.mockRejectedValueOnce(new Error("Shopify timeout"));

    const result = await harness.executeTool("marketing.list_products", {});
    expect(result.error).toMatch(/Shopify timeout/);
  });
});
