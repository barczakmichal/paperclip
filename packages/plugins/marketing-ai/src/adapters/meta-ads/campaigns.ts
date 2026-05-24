import type { AdAccount } from "facebook-nodejs-business-sdk";
import { Campaign } from "facebook-nodejs-business-sdk";

export interface CampaignSpec {
  name: string;
  objective: string; // e.g. "OUTCOME_SALES" | "OUTCOME_AWARENESS"
  dailyBudgetCents: number; // in account currency smallest unit
  startTime?: string; // ISO 8601
  stopTime?: string;
}

export interface CampaignResult {
  id: string;
  name: string;
  status: string;
}

export async function createCampaign(
  account: AdAccount,
  spec: CampaignSpec,
): Promise<CampaignResult> {
  const fields: string[] = [];
  const params = {
    [Campaign.Fields.name]: spec.name,
    [Campaign.Fields.objective]: spec.objective,
    [Campaign.Fields.status]: Campaign.Status.paused, // start paused, activate after approval
    [Campaign.Fields.daily_budget]: String(spec.dailyBudgetCents),
    ...(spec.startTime ? { [Campaign.Fields.start_time]: spec.startTime } : {}),
    ...(spec.stopTime ? { [Campaign.Fields.stop_time]: spec.stopTime } : {}),
    special_ad_categories: [],
  };
  const result = await account.createCampaign(fields, params) as { id: string };
  return { id: result.id, name: spec.name, status: "PAUSED" };
}

export async function pauseCampaign(campaignId: string, accessToken: string): Promise<void> {
  const campaign = new Campaign(campaignId);
  await campaign.update([Campaign.Fields.status], {
    [Campaign.Fields.status]: Campaign.Status.paused,
    access_token: accessToken,
  } as unknown as Record<string, unknown>);
}

export async function getCampaign(
  campaignId: string,
  accessToken: string,
): Promise<CampaignResult> {
  const campaign = new Campaign(campaignId);
  const result = await campaign.get([
    Campaign.Fields.id,
    Campaign.Fields.name,
    Campaign.Fields.status,
  ], { access_token: accessToken }) as CampaignResult;
  return result;
}
