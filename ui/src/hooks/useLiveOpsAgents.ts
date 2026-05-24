import { useQuery } from "@tanstack/react-query";
import { liveOpsApi, type LiveAgentRow } from "@/api/liveOps";

export function useLiveOpsAgents(companyId: string | null | undefined) {
  return useQuery<LiveAgentRow[]>({
    queryKey: ["live-ops", "agents", companyId],
    queryFn: () => liveOpsApi.liveAgentsForCompany(companyId!),
    enabled: !!companyId,
    refetchInterval: 2000,
  });
}
