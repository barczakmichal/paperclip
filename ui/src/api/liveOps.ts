import { api } from "./client";

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

export const liveOpsApi = {
  liveAgentsForCompany: (companyId: string) =>
    api
      .get<{ agents: LiveAgentRow[] }>(`/companies/${companyId}/live-agents`)
      .then((r) => r.agents),
};
