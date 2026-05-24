// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LevelBadge } from "./LevelBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LevelBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders level number with 'LVL' prefix", () => {
    const root = createRoot(c);
    act(() => { root.render(<LevelBadge level={7} />); });
    expect(c.textContent).toBe("LVL 7");
  });

  it("supports size variants", () => {
    const root = createRoot(c);
    act(() => { root.render(<LevelBadge level={3} size="xs" />); });
    const el = c.querySelector("[data-level-badge]");
    expect(el?.className).toMatch(/text-\[9px\]|text-xs/);
  });
});
