import { api } from "./client";

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string | null;
  platform: "meta" | "google";
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  createdAt: string;
  roas?: number;
}

export const marketingApi = {
  listCampaigns: (companyId: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return api.get<MarketingCampaign[]>(
      `/plugins/marketing-ai/companies/${companyId}/campaigns${qs}`,
    );
  },
};
