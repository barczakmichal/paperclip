// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XPBar } from "./XPBar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("XPBar", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("computes width percentage", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={40} target={100} />); });
    const fill = c.querySelector<HTMLDivElement>("[data-xp-fill]");
    expect(fill?.style.width).toBe("40%");
  });

  it("caps at 100%", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={250} target={100} />); });
    const fill = c.querySelector<HTMLDivElement>("[data-xp-fill]");
    expect(fill?.style.width).toBe("100%");
  });

  it("renders label when provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={40} target={100} label="40 / 100 XP" />); });
    expect(c.textContent).toContain("40 / 100 XP");
  });
});
