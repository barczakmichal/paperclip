import { describe, it, expect } from "vitest";
import { composeAgentStatusReport } from "../services/agent-status.js";

describe("composeAgentStatusReport", () => {
  it("łączy teraz i ostatnio", () => {
    const r = composeAgentStatusReport({ now: "brief kampanii", last: "3 maile ULTRA", online: "active" });
    expect(r).toBe("Teraz: brief kampanii. Ostatnio: 3 maile ULTRA.");
  });
  it("gdy brak aktywności pokazuje bezczynność", () => {
    const r = composeAgentStatusReport({ now: null, last: null, online: "idle" });
    expect(r).toBe("Bezczynny.");
  });
  it("przycina do 500 code points", () => {
    const long = "x".repeat(800);
    const r = composeAgentStatusReport({ now: long, last: null, online: "active" });
    expect([...r].length).toBeLessThanOrEqual(500);
  });
});
