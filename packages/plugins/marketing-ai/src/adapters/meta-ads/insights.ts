import type { AdAccount } from "facebook-nodejs-business-sdk";
import { AdsInsights } from "facebook-nodejs-business-sdk";

export interface InsightsResult {
  spend: number;           // account currency
  impressions: number;
  clicks: number;
  ctr: number;             // 0-100 (%)
  conversions: number;
  conversionValue: number; // account currency
  roas: number;            // conversionValue / spend; 0 if spend=0
}

export async function fetchInsights(
  account: AdAccount,
  campaignId: string,
  since: string,  // "YYYY-MM-DD"
  until: string,
): Promise<InsightsResult> {
  const fields = [
    AdsInsights.Fields.spend,
    AdsInsights.Fields.impressions,
    AdsInsights.Fields.clicks,
    AdsInsights.Fields.ctr,
    AdsInsights.Fields.actions,
    AdsInsights.Fields.action_values,
  ];
  const params = {
    time_range: { since, until },
    filtering: [{ field: "campaign.id", operator: "EQUAL", value: campaignId }],
    level: "campaign",
  };

  const cursor = await account.getInsights(fields, params);
  const rows = await cursor.next() as Array<Record<string, string>>;
  const row = rows[0];
  if (!row) return { spend: 0, impressions: 0, clicks: 0, ctr: 0, conversions: 0, conversionValue: 0, roas: 0 };

  const spend = parseFloat(row["spend"] ?? "0");
  const impressions = parseInt(row["impressions"] ?? "0", 10);
  const clicks = parseInt(row["clicks"] ?? "0", 10);
  const ctr = parseFloat(row["ctr"] ?? "0");

  // Sum "purchase" action value for ROAS
  const actionValues = (row["action_values"] ?? []) as Array<{ action_type: string; value: string }>;
  const conversionValue = actionValues
    .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase")
    .reduce((sum, a) => sum + parseFloat(a.value ?? "0"), 0);
  const actions = (row["actions"] ?? []) as Array<{ action_type: string; value: string }>;
  const conversions = actions
    .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase")
    .reduce((sum, a) => sum + parseInt(a.value ?? "0", 10), 0);

  const roas = spend > 0 ? conversionValue / spend : 0;
  return { spend, impressions, clicks, ctr, conversions, conversionValue, roas };
}
