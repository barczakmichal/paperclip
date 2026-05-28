import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { approvalsApi } from "@/api/approvals";
import { ApprovalCard } from "./ApprovalCard";

export interface LiveOpsApprovalsFooterProps {
  companyId: string;
}

export function LiveOpsApprovalsFooter({ companyId }: LiveOpsApprovalsFooterProps) {
  const { t } = useTranslation("liveOpsApprovalsFooter");
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["live-ops", "approvals", companyId],
    queryFn: () => approvalsApi.list(companyId, "pending"),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live-ops", "approvals", companyId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["live-ops", "approvals", companyId] });
    },
  });

  const pending = (data ?? []).filter((a) => a.status === "pending").slice(0, 3);
  if (pending.length === 0) return null;

  return (
    <div className="border-t border-border bg-card/30 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {t("pendingApprovals", "Pending approvals")}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {pending.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            requesterAgent={null}
            isPending={approveMutation.isPending || rejectMutation.isPending}
            onApprove={() => approveMutation.mutate(approval.id)}
            onReject={() => rejectMutation.mutate(approval.id)}
          />
        ))}
      </div>
    </div>
  );
}
