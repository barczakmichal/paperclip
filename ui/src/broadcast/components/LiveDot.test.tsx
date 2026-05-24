// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveDot } from "./LiveDot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveDot", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("renders text label", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="active" label="live" />); });
    expect(container.textContent).toContain("live");
  });

  it("applies pulse animation when pulse=true and status=active", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="active" pulse label="live" />); });
    const dot = container.querySelector("[data-live-dot]");
    expect(dot?.className).toContain("animate-pulse");
  });

  it("does not pulse when status=idle even if pulse=true", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="idle" pulse label="idle" />); });
    const dot = container.querySelector("[data-live-dot]");
    expect(dot?.className).not.toContain("animate-pulse");
  });
});
