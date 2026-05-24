// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentBroadcastCard, type AgentBroadcastCardProps } from "./AgentBroadcastCard";
import type { ThoughtLine } from "./ThoughtStream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const baseProps: AgentBroadcastCardProps = {
  agent: { id: "a1", name: "Marketing AI", initials: "M", color: "var(--grad-agent)" },
  status: "active",
  currentTask: "Kampania wiosenna 2026",
  currentTool: "meta_ads.create_campaign",
  cost: { value: 0.41, cap: 5, currency: "USD" },
  level: 7,
  streakDays: 12,
  thoughts: [{ kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" }] as ThoughtLine[],
  tags: [{ kind: "platform", platform: "meta" }, { kind: "text", text: "PROPOSAL", tone: "warning" }],
  variant: "full",
};

describe("AgentBroadcastCard", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders agent name and initials", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("Marketing AI");
  });

  it("renders cost ticker", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("$0.41");
  });

  it("renders level and streak badges when in 'full' variant", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("LVL 7");
    expect(c.textContent).toContain("12d");
  });

  it("renders thought stream when thoughts non-empty", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("Audiencja wędkarze");
  });

  it("renders PlatformBadge from tags", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("META");
  });

  it("does not render thought stream in 'compact' variant", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} variant="compact" />); });
    expect(c.textContent).not.toContain("Audiencja wędkarze");
  });
});
