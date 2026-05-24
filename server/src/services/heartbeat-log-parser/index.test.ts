import { describe, it, expect } from "vitest";
import { getLogParserFor, initialParserState } from "./index.js";

describe("getLogParserFor", () => {
  it("returns claude-local parser for claude-local adapter", () => {
    const p = getLogParserFor("claude-local");
    expect(p).toBeDefined();
    const result = p.parse("test", initialParserState);
    expect(result.signals).toEqual([]);
  });

  it("returns openclaw-gateway parser for openclaw-gateway adapter", () => {
    const p = getLogParserFor("openclaw-gateway");
    expect(p).toBeDefined();
    const result = p.parse("test", initialParserState);
    expect(result.signals).toEqual([]);
  });

  it("returns generic parser for unknown adapter", () => {
    const p = getLogParserFor("unknown-adapter-xyz");
    expect(p).toBeDefined();
    const result = p.parse("foo", { buffer: "" });
    expect(result.signals).toEqual([]);
    expect(result.next).toBeDefined();
  });

  it("preserves parser state in stubs", () => {
    const p = getLogParserFor("claude-local");
    const state: typeof initialParserState = { buffer: "leftover" };
    const result = p.parse("more", state);
    expect(result.next).toEqual(state); // stubs return same state
  });
});
