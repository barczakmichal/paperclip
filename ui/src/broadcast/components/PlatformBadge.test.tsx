// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformBadge } from "./PlatformBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("PlatformBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 'META' for meta platform", () => {
    const root = createRoot(c);
    act(() => { root.render(<PlatformBadge platform="meta" />); });
    expect(c.textContent).toBe("META");
  });

  it("renders 'GOOGLE' for google platform", () => {
    const root = createRoot(c);
    act(() => { root.render(<PlatformBadge platform="google" />); });
    expect(c.textContent).toBe("GOOGLE");
  });
});
