import { beforeEach, describe, expect, it } from "vitest";
import {
  CHANNEL_SYNC_THROTTLE_MS,
  resetChannelSyncThrottle,
  shouldSyncCompanyChannels,
} from "../routes/channels.js";

describe("throttling syncForCompany (shouldSyncCompanyChannels)", () => {
  beforeEach(() => {
    resetChannelSyncThrottle();
  });

  it("przepuszcza sync przy pierwszym żądaniu dla firmy", () => {
    expect(shouldSyncCompanyChannels("company-1", 1000)).toBe(true);
  });

  it("pomija sync w obrębie TTL od ostatniego", () => {
    expect(shouldSyncCompanyChannels("company-1", 1000)).toBe(true);
    // Tuż przed granicą TTL — wciąż w oknie throttlingu.
    expect(shouldSyncCompanyChannels("company-1", 1000 + CHANNEL_SYNC_THROTTLE_MS - 1)).toBe(false);
  });

  it("przepuszcza sync po wygaśnięciu TTL", () => {
    expect(shouldSyncCompanyChannels("company-1", 1000)).toBe(true);
    // Dokładnie po TTL (now - last === TTL, warunek `< TTL` już niespełniony).
    expect(shouldSyncCompanyChannels("company-1", 1000 + CHANNEL_SYNC_THROTTLE_MS)).toBe(true);
  });

  it("throttluje firmy niezależnie (per companyId)", () => {
    expect(shouldSyncCompanyChannels("company-1", 1000)).toBe(true);
    // Inna firma w tym samym czasie — własne, niezależne okno throttlingu.
    expect(shouldSyncCompanyChannels("company-2", 1000)).toBe(true);
    // Powtórzenie dla obu w oknie TTL — obie pominięte.
    expect(shouldSyncCompanyChannels("company-1", 1500)).toBe(false);
    expect(shouldSyncCompanyChannels("company-2", 1500)).toBe(false);
  });

  it("kolejne żądanie po TTL ponownie ustawia okno (sliding od ostatniego synca)", () => {
    expect(shouldSyncCompanyChannels("company-1", 1000)).toBe(true);
    expect(shouldSyncCompanyChannels("company-1", 1000 + CHANNEL_SYNC_THROTTLE_MS)).toBe(true);
    // Po drugim syncu okno liczy się od jego timestampu.
    expect(shouldSyncCompanyChannels("company-1", 1000 + CHANNEL_SYNC_THROTTLE_MS + 1)).toBe(false);
  });
});
