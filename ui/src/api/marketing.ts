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

export interface MarketingCreative {
  id: string;
  format: string;
  status: string;
  imageUrl: string | null;
  headlines: string[];
  bodies: string[];
  descriptions: string[];
  cta: string | null;
  platformAssetId: string | null;
  errorDetail: string | null;
  createdAt: string;
}

export interface MarketingAuditEntry {
  id: string;
  action: string;
  userId: string | null;
  agentId: string | null;
  entityType: string | null;
  payloadDiff: Record<string, unknown> | null;
  createdAt: string;
}

export interface MarketingCampaignDetail {
  campaign: MarketingCampaign & {
    audienceBrief: string | null;
    productIds: string[];
    briefJson: Record<string, unknown> | null;
    platformCampaignId: string | null;
    approvalId: string | null;
    rejectionReason: string | null;
    publishedAt: string | null;
    updatedAt: string;
  };
  creatives: MarketingCreative[];
  auditLog: MarketingAuditEntry[];
}

export const marketingApi = {
  listCampaigns: (companyId: string, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return api.get<MarketingCampaign[]>(
      `/plugins/marketing-ai/companies/${companyId}/campaigns${qs}`,
    );
  },
  getCampaign: (companyId: string, campaignId: string) =>
    api.get<MarketingCampaignDetail>(
      `/plugins/marketing-ai/companies/${companyId}/campaigns/${campaignId}`,
    ),
  pauseCampaign: (companyId: string, campaignId: string, reason?: string) =>
    api.post<{ ok: true; status: string }>(
      `/plugins/marketing-ai/companies/${companyId}/campaigns/${campaignId}/pause`,
      { reason },
    ),
};
