import { useParams } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useLiveOpsAgents } from "@/hooks/useLiveOpsAgents";
import { AgentBroadcastCard, ThoughtStream, type LiveDotStatus } from "@/broadcast";

function mapStatus(status: string): LiveDotStatus {
  if (status === "running" || status === "queued") return "active";
  if (status === "failed" || status === "error") return "error";
  if (status === "paused") return "warning";
  if (status === "completed" || status === "succeeded") return "success";
  return "idle";
}

export function AgentSoloPage() {
  const { t } = useTranslation("agentSoloPage");
  const { agentId } = useParams<{ agentId: string }>();
  const { selectedCompanyId } = useCompany();
  const { data: agents = [] } = useLiveOpsAgents(selectedCompanyId);
  const agent = agents.find((a) => a.agentId === agentId);

  if (!agent) {
    return <div className="p-6 text-muted-foreground">{t("agentNotFound", "Agent not found")}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
      <AgentBroadcastCard
        agent={{
          id: agent.agentId,
          name: agent.agentName,
          initials: (agent.agentName?.[0] ?? "?").toUpperCase(),
          color: "var(--grad-agent)",
        }}
        status={mapStatus(agent.runStatus)}
        currentTask={agent.currentTask ?? "—"}
        currentTool={agent.currentTool ?? undefined}
        cost={{ value: (agent.currentCostCents ?? 0) / 100, currency: "USD" }}
        thoughts={agent.currentThought ? [{ kind: "thought", text: agent.currentThought }] : undefined}
        variant="hero"
      />
      {agent.currentThought && (
        <ThoughtStream
          lines={[{ kind: "thought", text: agent.currentThought }]}
          active={agent.runStatus === "running"}
          maxLines={12}
        />
      )}
    </div>
  );
}
