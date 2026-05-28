import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useLiveOpsAgents } from "@/hooks/useLiveOpsAgents";
import { useBroadcastMode } from "@/broadcast/hooks/useBroadcastMode";
import { LiveOpsTopMetrics } from "@/components/LiveOpsTopMetrics";
import { LiveOpsGrid } from "@/components/LiveOpsGrid";
import { LiveOpsApprovalsFooter } from "@/components/LiveOpsApprovalsFooter";
import { Button } from "@/components/ui/button";

export function LiveOpsPage() {
  const { t } = useTranslation("liveOpsPage");
  const { selectedCompanyId } = useCompany();
  const { data: agents = [], isLoading } = useLiveOpsAgents(selectedCompanyId);
  const { mode, toggle } = useBroadcastMode();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          {t("title", "Live Ops")}
        </h1>
        <Button onClick={toggle} variant="outline" size="sm">
          {mode === "hero" ? t("exitBroadcast", "Exit broadcast") : t("broadcastMode", "Broadcast mode")}
        </Button>
      </header>

      <LiveOpsTopMetrics agents={agents} pendingApprovals={0} tasksDoneToday={0} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("loading", "Loading...")}</div>
      ) : (
        <LiveOpsGrid agents={agents} mode={mode} />
      )}

      {selectedCompanyId && <LiveOpsApprovalsFooter companyId={selectedCompanyId} />}
    </div>
  );
}
