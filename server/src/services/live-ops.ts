import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns } from "@paperclipai/db";

export interface LiveAgentRow {
  agentId: string;
  agentName: string;
  agentIcon: string | null;
  runId: string | null;
  runStatus: string;
  startedAt: string | null;
  currentTask: string | null;
  currentThought: string | null;
  currentTool: string | null;
  currentCostCents: number;
  currentThoughtUpdatedAt: string | null;
}

export function liveOpsService(db: Db) {
  return {
    async listLiveAgents(companyId: string): Promise<LiveAgentRow[]> {
      const rows = await db.execute<{
        agent_id: string;
        agent_name: string;
        agent_icon: string | null;
        run_id: string | null;
        run_status: string | null;
        started_at: string | null;
        current_task: string | null;
        current_thought: string | null;
        current_tool: string | null;
        current_cost_cents: number | null;
        current_thought_updated_at: string | null;
      }>(sql`
        SELECT
          a.id AS agent_id,
          a.name AS agent_name,
          a.icon AS agent_icon,
          r.id AS run_id,
          r.status AS run_status,
          r.started_at AS started_at,
          r.trigger_detail AS current_task,
          r.current_thought AS current_thought,
          r.current_tool AS current_tool,
          r.current_cost_cents AS current_cost_cents,
          r.current_thought_updated_at AS current_thought_updated_at
        FROM ${agents} a
        LEFT JOIN LATERAL (
          SELECT *
          FROM ${heartbeatRuns} r2
          WHERE r2.agent_id = a.id AND r2.company_id = ${companyId}
          ORDER BY r2.started_at DESC NULLS LAST
          LIMIT 1
        ) r ON true
        WHERE a.company_id = ${companyId}
        ORDER BY a.name;
      `);

      return rows.map((r) => ({
        agentId: r.agent_id,
        agentName: r.agent_name,
        agentIcon: r.agent_icon,
        runId: r.run_id,
        runStatus: r.run_status ?? "idle",
        startedAt: r.started_at,
        currentTask: r.current_task,
        currentThought: r.current_thought,
        currentTool: r.current_tool,
        currentCostCents: r.current_cost_cents ?? 0,
        currentThoughtUpdatedAt: r.current_thought_updated_at,
      }));
    },
  };
}
