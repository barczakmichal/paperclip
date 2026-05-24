// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThoughtStream, type ThoughtLine } from "./ThoughtStream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const lines: ThoughtLine[] = [
  { kind: "tool", text: "tool: meta_ads.create_campaign", ts: "0.1s" },
  { kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" },
];

describe("ThoughtStream", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders each line", () => {
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={lines} />); });
    expect(c.textContent).toContain("meta_ads.create_campaign");
    expect(c.textContent).toContain("Audiencja wędkarze");
  });

  it("renders blinking cursor when active=true", () => {
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={lines} active />); });
    expect(c.querySelector("[data-thought-cursor]")).not.toBeNull();
  });

  it("respects maxLines prop", () => {
    const many: ThoughtLine[] = Array.from({ length: 10 }, (_, i) => ({ kind: "thought" as const, text: `L${i}`, ts: `${i}s` }));
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={many} maxLines={3} />); });
    expect(c.querySelectorAll("[data-thought-line]").length).toBe(3);
  });
});
