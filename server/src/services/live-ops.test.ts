import { describe, it, expect } from "vitest";
import { liveOpsService } from "./live-ops.js";

describe("liveOpsService factory", () => {
  it("returns an object with listLiveAgents method", () => {
    const fakeDb = { execute: async () => [] } as any;
    const svc = liveOpsService(fakeDb);
    expect(typeof svc.listLiveAgents).toBe("function");
  });

  it("maps null runStatus to 'idle'", async () => {
    const fakeDb = {
      execute: async () => [
        {
          agent_id: "a1",
          agent_name: "A",
          agent_icon: null,
          run_id: null,
          run_status: null,
          started_at: null,
          current_task: null,
          current_thought: null,
          current_tool: null,
          current_cost_cents: null,
          current_thought_updated_at: null,
        },
      ],
    } as any;
    const svc = liveOpsService(fakeDb);
    const result = await svc.listLiveAgents("c1");
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("a1");
    expect(result[0].runStatus).toBe("idle");
    expect(result[0].currentCostCents).toBe(0);
  });

  it("preserves runStatus when present", async () => {
    const fakeDb = {
      execute: async () => [
        {
          agent_id: "a1",
          agent_name: "A",
          agent_icon: null,
          run_id: "r1",
          run_status: "running",
          started_at: "2026-05-24T10:00:00Z",
          current_task: "Kampania",
          current_thought: "thinking...",
          current_tool: "meta_ads.create",
          current_cost_cents: 42,
          current_thought_updated_at: "2026-05-24T10:05:00Z",
        },
      ],
    } as any;
    const svc = liveOpsService(fakeDb);
    const [row] = await svc.listLiveAgents("c1");
    expect(row.runStatus).toBe("running");
    expect(row.currentTool).toBe("meta_ads.create");
    expect(row.currentCostCents).toBe(42);
  });
});
