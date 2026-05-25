import { describe, it, expect, vi } from "vitest";
import { fetchMetrics } from "../src/adapters/google-ads/metrics.js";

describe("Google fetchMetrics", () => {
  it("returns zeroed result for empty rows", async () => {
    const mockCustomer = { query: vi.fn().mockResolvedValue([]) };
    const result = await fetchMetrics(mockCustomer as never, "456", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(0);
    expect(result.roas).toBe(0);
  });

  it("aggregates multiple daily rows", async () => {
    const rows = [
      { metrics: { cost_micros: 5_000_000, impressions: 1000, clicks: 50, conversions: 5, conversions_value: 100 } },
      { metrics: { cost_micros: 3_000_000, impressions: 800, clicks: 30, conversions: 3, conversions_value: 60 } },
    ];
    const mockCustomer = { query: vi.fn().mockResolvedValue(rows) };
    const result = await fetchMetrics(mockCustomer as never, "456", "2026-01-01", "2026-01-31");
    expect(result.spend).toBeCloseTo(8);
    expect(result.conversions).toBe(8);
    expect(result.conversionValue).toBe(160);
    expect(result.roas).toBeCloseTo(20);
  });
});
