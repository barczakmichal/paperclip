import { describe, it, expect, vi } from "vitest";
import { fetchInsights } from "../src/adapters/meta-ads/insights.js";

describe("Meta fetchInsights", () => {
  it("returns zero result when no rows returned", async () => {
    const mockAccount = {
      getInsights: vi.fn().mockResolvedValue({
        next: vi.fn().mockResolvedValue([]),
      }),
    };

    const result = await fetchInsights(mockAccount as never, "123", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(0);
    expect(result.roas).toBe(0);
    expect(result.impressions).toBe(0);
  });

  it("computes ROAS correctly from row data", async () => {
    const row = {
      spend: "100.00",
      impressions: "5000",
      clicks: "200",
      ctr: "4.0",
      actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "10" }],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "350.00" }],
    };
    const mockAccount = {
      getInsights: vi.fn().mockResolvedValue({
        next: vi.fn().mockResolvedValue([row]),
      }),
    };

    const result = await fetchInsights(mockAccount as never, "123", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(100);
    expect(result.conversions).toBe(10);
    expect(result.conversionValue).toBe(350);
    expect(result.roas).toBeCloseTo(3.5);
  });
});
