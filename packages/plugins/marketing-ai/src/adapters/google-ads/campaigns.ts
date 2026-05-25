import type { Customer } from "google-ads-api";
import { enums } from "google-ads-api";

export interface GoogleCampaignSpec {
  name: string;
  budgetAmountMicros: number; // daily budget in micros (1 PLN = 1_000_000 micros)
  advertisingChannelType?: string; // default SEARCH
}

export interface GoogleCampaignResult {
  id: string;
  name: string;
  status: string;
  budgetId: string;
}

export async function createCampaign(
  customer: Customer,
  spec: GoogleCampaignSpec,
): Promise<GoogleCampaignResult> {
  // 1. Create campaign budget
  const budgetResult = await customer.campaignBudgets.create([{
    name: `${spec.name} Budget`,
    amount_micros: spec.budgetAmountMicros,
    delivery_method: enums.BudgetDeliveryMethod.STANDARD,
  }]);
  const budgetId = String(budgetResult.results[0]?.resource_name ?? "");

  // 2. Create campaign (paused — activated on approval)
  const campaignResult = await customer.campaigns.create([{
    name: spec.name,
    status: enums.CampaignStatus.PAUSED,
    advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
    campaign_budget: budgetId,
    manual_cpc: { enhanced_cpc_enabled: false },
  }]);
  const campaignResourceName = campaignResult.results[0]?.resource_name ?? "";
  const id = campaignResourceName.split("/").pop() ?? "";

  return { id, name: spec.name, status: "PAUSED", budgetId };
}

export async function pauseCampaign(customer: Customer, campaignId: string): Promise<void> {
  await customer.campaigns.update([{
    resource_name: `customers/${(customer as unknown as { customer_id: string }).customer_id}/campaigns/${campaignId}`,
    status: enums.CampaignStatus.PAUSED,
  }]);
}

export async function getCampaign(
  customer: Customer,
  campaignId: string,
): Promise<GoogleCampaignResult> {
  const [row] = await customer.query(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget
     FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`
  );
  const c = row?.campaign;
  return {
    id: String(c?.id ?? campaignId),
    name: String(c?.name ?? ""),
    status: String(c?.status ?? ""),
    budgetId: String(c?.campaign_budget ?? ""),
  };
}
