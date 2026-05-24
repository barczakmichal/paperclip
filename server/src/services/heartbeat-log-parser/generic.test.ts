import { describe, it, expect } from "vitest";
import { genericParser } from "./generic.js";
import { initialParserState } from "./types.js";

describe("genericParser", () => {
  it("emits no signals for any input", () => {
    const r = genericParser.parse("anything at all", initialParserState);
    expect(r.signals).toEqual([]);
  });

  it("preserves parser state (buffer pass-through)", () => {
    const state = { buffer: "leftover" };
    const r = genericParser.parse("more", state);
    expect(r.next).toBe(state);
  });
});
