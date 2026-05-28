import { useTranslation } from "react-i18next";
import { MetricCard } from "./MetricCard";
import { Bot, CheckCircle2, DollarSign, Clock } from "lucide-react";
import type { LiveAgentRow } from "@/api/liveOps";

export interface LiveOpsTopMetricsProps {
  agents: LiveAgentRow[];
  pendingApprovals: number;
  tasksDoneToday: number;
}

export function LiveOpsTopMetrics({ agents, pendingApprovals, tasksDoneToday }: LiveOpsTopMetricsProps) {
  const { t } = useTranslation("liveOpsTopMetrics");
  const activeCount = agents.filter((a) => a.runStatus === "running" || a.runStatus === "queued").length;
  const costTodayCents = agents.reduce((sum, a) => sum + (a.currentCostCents ?? 0), 0);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <MetricCard icon={Bot} value={activeCount} label={t("activeAgents", "Active agents")} />
      <MetricCard icon={CheckCircle2} value={tasksDoneToday} label={t("tasksDoneToday", "Tasks done today")} />
      <MetricCard icon={DollarSign} value={`$${(costTodayCents / 100).toFixed(2)}`} label={t("costToday", "Cost today")} />
      <MetricCard icon={Clock} value={pendingApprovals} label={t("pendingApprovals", "Pending approvals")} />
    </div>
  );
}
