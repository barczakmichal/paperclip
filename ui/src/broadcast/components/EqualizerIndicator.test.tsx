// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EqualizerIndicator } from "./EqualizerIndicator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("EqualizerIndicator", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 4 bars", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active />); });
    expect(c.querySelectorAll("[data-eq-bar]").length).toBe(4);
  });

  it("bars are static when active=false", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active={false} />); });
    const wrapper = c.querySelector("[data-eq-active]");
    expect(wrapper?.getAttribute("data-eq-active")).toBe("false");
  });

  it("bars animate when active=true", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active />); });
    const wrapper = c.querySelector("[data-eq-active]");
    expect(wrapper?.getAttribute("data-eq-active")).toBe("true");
  });
});
