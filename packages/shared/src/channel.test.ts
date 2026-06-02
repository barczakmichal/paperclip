import { describe, it, expect } from "vitest";
import { CHANNEL_ROLE_KEY_MAP, channelKeyForRole, CHANNEL_STATUS_MAX_CHARS } from "./constants.js";

describe("channel role mapping", () => {
  it("maps known C-level roles to stable keys", () => {
    expect(channelKeyForRole("cmo")).toBe("marketing");
    expect(channelKeyForRole("cfo")).toBe("finance");
    expect(channelKeyForRole("cto")).toBe("tech");
  });
  it("falls back to the role itself for unmapped roles", () => {
    expect(channelKeyForRole("researcher")).toBe("researcher");
  });
  it("caps the status report length", () => {
    expect(CHANNEL_STATUS_MAX_CHARS).toBe(500);
  });
  it("exposes the mapping object", () => {
    expect(CHANNEL_ROLE_KEY_MAP.cmo).toEqual({ key: "marketing", name: "Marketing" });
  });
});
