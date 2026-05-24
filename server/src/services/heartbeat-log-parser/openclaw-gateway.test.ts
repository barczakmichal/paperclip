import { describe, it, expect } from "vitest";
import { openclawGatewayParser } from "./openclaw-gateway.js";
import { initialParserState } from "./types.js";

describe("openclawGatewayParser", () => {
  it("emits no signals for an empty chunk", () => {
    const { signals, next } = openclawGatewayParser.parse("", initialParserState);
    expect(signals).toEqual([]);
    expect(next.buffer).toBe("");
  });

  it("emits no signals for a plain [openclaw-gateway] lifecycle log line", () => {
    const chunk = "[openclaw-gateway] connecting to wss://example.com\n";
    const { signals, next } = openclawGatewayParser.parse(chunk, initialParserState);
    expect(signals).toEqual([]);
    expect(next.buffer).toBe("");
  });

  it("emits no signals for an assistant stream event (format recognized, no signal yet)", () => {
    const data = JSON.stringify({ delta: "Hello world" });
    const chunk = `[openclaw-gateway:event] run=run-abc stream=assistant data=${data}\n`;
    const { signals } = openclawGatewayParser.parse(chunk, initialParserState);
    // Gateway does not expose per-token thought/cost signals — no signals expected
    expect(signals).toEqual([]);
  });

  it("emits no signals for an error stream event", () => {
    const data = JSON.stringify({ error: "something failed" });
    const chunk = `[openclaw-gateway:event] run=run-abc stream=error data=${data}\n`;
    const { signals } = openclawGatewayParser.parse(chunk, initialParserState);
    expect(signals).toEqual([]);
  });

  it("emits no signals for a lifecycle stream event", () => {
    const data = JSON.stringify({ phase: "done", runId: "run-abc" });
    const chunk = `[openclaw-gateway:event] run=run-abc stream=lifecycle data=${data}\n`;
    const { signals } = openclawGatewayParser.parse(chunk, initialParserState);
    expect(signals).toEqual([]);
  });

  it("preserves incomplete last line in buffer", () => {
    const partial = "[openclaw-gateway:event] run=run-abc stream=assistant data={";
    const { signals, next } = openclawGatewayParser.parse(partial, initialParserState);
    expect(signals).toEqual([]);
    expect(next.buffer).toBe(partial);
  });

  it("flushes buffered partial line when newline arrives", () => {
    const part1 = "[openclaw-gateway] connect";
    const part2 = "ed protocol=3\n";
    const r1 = openclawGatewayParser.parse(part1, initialParserState);
    expect(r1.next.buffer).toBe(part1);

    const r2 = openclawGatewayParser.parse(part2, r1.next);
    expect(r2.signals).toEqual([]);
    expect(r2.next.buffer).toBe("");
  });

  it("handles multiple lines in a single chunk", () => {
    const chunk = [
      "[openclaw-gateway] connecting to wss://example.com",
      "[openclaw-gateway] device auth disabled",
      `[openclaw-gateway:event] run=run-1 stream=assistant data=${JSON.stringify({ delta: "hi" })}`,
      "",
    ].join("\n");
    const { signals, next } = openclawGatewayParser.parse(chunk, initialParserState);
    expect(signals).toEqual([]);
    expect(next.buffer).toBe("");
  });

  it("preserves state across sequential parse calls", () => {
    const state1 = { buffer: "carry-over" };
    const { next: state2 } = openclawGatewayParser.parse("", state1);
    // buffer should only be consumed when a newline arrives
    expect(state2.buffer).toBe("carry-over");
  });
});
