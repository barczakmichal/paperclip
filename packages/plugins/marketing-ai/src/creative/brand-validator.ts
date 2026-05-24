import type { BrandKit } from "./brief-generator.js";

export function validateCopyAgainstBrandKit(copyLines: string[], brandKit: BrandKit): void {
  const doNots = brandKit.doNots ?? [];
  const combined = copyLines.join(" ").toLowerCase();
  for (const forbidden of doNots) {
    if (combined.includes(forbidden.toLowerCase())) {
      throw new Error(`Brand kit violation: forbidden phrase "${forbidden}" found in copy`);
    }
  }
}
