import { describe, it, expect, vi, beforeEach } from "vitest";
import { createShopifyCatalog } from "../src/creative/shop-catalog.js";

const mockFetch = vi.fn();

describe("ShopifyCatalog.listProducts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("maps Shopify products to CatalogProduct shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [{
          id: 123,
          title: "Spinning Rod XL",
          variants: [{ price: "249.99" }],
          images: [{ src: "https://cdn.example.com/rod.jpg" }],
          inventory_quantity: 15,
        }],
      }),
    });

    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
    });

    const result = await catalog.listProducts({ limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "123",
      title: "Spinning Rod XL",
      price: "249.99",
      imageUrls: ["https://cdn.example.com/rod.jpg"],
      stock: 15,
    });
  });

  it("retries 3x on shop API timeout", async () => {
    const err = new Error("timeout");
    mockFetch
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ products: [] }) });

    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
      maxRetries: 2,
    });

    const result = await catalog.listProducts({ limit: 5 });
    expect(result).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 consecutive failures", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
      maxRetries: 2,
    });
    await expect(catalog.listProducts({})).rejects.toThrow();
  });
});
