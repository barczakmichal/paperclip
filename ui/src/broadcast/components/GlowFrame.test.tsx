// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlowFrame } from "./GlowFrame";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("GlowFrame", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("renders children", () => {
    const root = createRoot(container);
    act(() => { root.render(<GlowFrame state="active"><span>kids</span></GlowFrame>); });
    expect(container.textContent).toBe("kids");
  });

  it("applies state-specific class for 'active'", () => {
    const root = createRoot(container);
    act(() => { root.render(<GlowFrame state="active">x</GlowFrame>); });
    const frame = container.querySelector("[data-glow-state='active']");
    expect(frame).not.toBeNull();
  });

  it("renders without crashing for each state", () => {
    const states = ["active", "idle", "warning", "success", "error"] as const;
    for (const s of states) {
      const root = createRoot(container);
      act(() => { root.render(<GlowFrame state={s}>x</GlowFrame>); });
      expect(container.querySelector(`[data-glow-state='${s}']`)).not.toBeNull();
      act(() => { root.unmount(); });
    }
  });
});
