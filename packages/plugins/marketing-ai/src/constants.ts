export const PLUGIN_ID = "marketing-ai" as const;
export const PLUGIN_VERSION = "0.1.0" as const;

export const SECRET_KEYS = {
  metaAccessToken: "marketing-ai/meta/access_token",
  metaLongLivedToken: "marketing-ai/meta/long_lived_token",
  metaAdAccountId: "marketing-ai/meta/ad_account_id",
  googleRefreshToken: "marketing-ai/google/refresh_token",
  googleCustomerId: "marketing-ai/google/customer_id",
  googleDeveloperToken: "marketing-ai/google/developer_token",
} as const;

export const TOOL_NAMES = {
  listProducts: "marketing.list_products",
  proposeCampaign: "marketing.propose_campaign",
  generateCreative: "marketing.generate_creative",
  submitForApproval: "marketing.submit_for_approval",
  fetchMetrics: "marketing.fetch_metrics",
  pauseCampaign: "marketing.pause_campaign",
} as const;
