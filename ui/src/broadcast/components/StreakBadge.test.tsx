// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StreakBadge } from "./StreakBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("StreakBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 'streak Xd' with day count", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={12} />); });
    expect(c.textContent).toContain("12d");
  });

  it("does not render fire icon when days < 1", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={0} />); });
    expect(c.querySelector("[data-streak-flame]")).toBeNull();
  });

  it("renders fire icon when days >= 1", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={3} />); });
    expect(c.querySelector("[data-streak-flame]")).not.toBeNull();
  });
});
