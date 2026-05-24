// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MissionCard } from "./MissionCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("MissionCard", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders title and progress", () => {
    const root = createRoot(c);
    act(() => { root.render(<MissionCard title="Kampania wiosenna" progress={0.6} />); });
    expect(c.textContent).toContain("Kampania wiosenna");
    expect(c.querySelector("[data-mission-progress]")).not.toBeNull();
  });

  it("renders reward when provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<MissionCard title="X" progress={0} reward="+50 XP" />); });
    expect(c.textContent).toContain("+50 XP");
  });

  it("renders subtasks count when tasks provided", () => {
    const root = createRoot(c);
    act(() => {
      root.render(<MissionCard title="X" progress={0.5} tasks={{ done: 2, total: 4 }} />);
    });
    expect(c.textContent).toMatch(/2\s*\/\s*4/);
  });
});
