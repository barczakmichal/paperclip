import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stub — using dynamic import to allow mock to apply first
const { getPlnRate, convertToPln } = await import("../src/adapters/nbp.js");

describe("NBP getPlnRate", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns 1 for PLN (no fetch)", async () => {
    const rate = await getPlnRate("PLN");
    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 1 for pln (case insensitive)", async () => {
    const rate = await getPlnRate("pln");
    expect(rate).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and returns mid-rate from NBP", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: [{ mid: 4.1523 }] }),
    });

    // Use unique currency code to avoid hitting in-process cache from other tests
    const rate = await getPlnRate("EUR");
    expect(rate).toBeCloseTo(4.1523);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.nbp.pl/api/exchangerates/rates/a/EUR")
    );
  });

  it("throws when NBP returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(getPlnRate("XYZ")).rejects.toThrow("NBP rate fetch failed for XYZ: 404");
  });
});

describe("NBP convertToPln", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("converts GBP to PLN using fetched rate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: [{ mid: 5.0 }] }),
    });

    // Use GBP (unique from other tests) to avoid cache collision
    const result = await convertToPln(100, "GBP");
    expect(result).toBeCloseTo(500);
  });
});
