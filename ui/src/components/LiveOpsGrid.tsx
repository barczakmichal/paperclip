import { AgentBroadcastCard, type LiveDotStatus } from "@/broadcast";
import { useNavigate } from "@/lib/router";
import type { LiveAgentRow } from "@/api/liveOps";

function mapStatus(status: string): LiveDotStatus {
  if (status === "running" || status === "queued") return "active";
  if (status === "failed" || status === "error") return "error";
  if (status === "paused") return "warning";
  if (status === "completed" || status === "succeeded") return "success";
  return "idle";
}

export interface LiveOpsGridProps {
  agents: LiveAgentRow[];
  mode: "full" | "hero";
}

export function LiveOpsGrid({ agents, mode }: LiveOpsGridProps) {
  const navigate = useNavigate();

  return (
    <div className={mode === "hero" ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"}>
      {agents.map((a) => (
        <AgentBroadcastCard
          key={a.agentId}
          agent={{
            id: a.agentId,
            name: a.agentName,
            initials: (a.agentName?.[0] ?? "?").toUpperCase(),
            color: "var(--grad-agent)",
          }}
          status={mapStatus(a.runStatus)}
          currentTask={a.currentTask ?? "—"}
          currentTool={a.currentTool ?? undefined}
          cost={{ value: (a.currentCostCents ?? 0) / 100, currency: "USD" }}
          thoughts={a.currentThought ? [{ kind: "thought", text: a.currentThought }] : undefined}
          variant={mode}
          onClick={() => navigate(`/live/${a.agentId}`)}
        />
      ))}
    </div>
  );
}
