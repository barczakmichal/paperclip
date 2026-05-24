// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CostTicker } from "./CostTicker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("CostTicker", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders formatted value in USD", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={0.41} currency="USD" />); });
    expect(c.textContent).toContain("$0.41");
  });

  it("renders formatted value in PLN", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={12.5} currency="PLN" />); });
    expect(c.textContent).toMatch(/12[,.]50\s?z[łl]/i);
  });

  it("renders cap line when cap provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={0.41} cap={5} currency="USD" />); });
    expect(c.textContent).toContain("/ $5.00 cap");
  });
});
