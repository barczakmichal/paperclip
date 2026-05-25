import type { Customer } from "google-ads-api";

export interface GoogleMetricsResult {
  spend: number;         // account currency (usually USD)
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export async function fetchMetrics(
  customer: Customer,
  campaignId: string,
  since: string,  // "YYYY-MM-DD"
  until: string,
): Promise<GoogleMetricsResult> {
  const rows = await customer.query(
    `SELECT
       metrics.cost_micros,
       metrics.impressions,
       metrics.clicks,
       metrics.ctr,
       metrics.conversions,
       metrics.conversions_value
     FROM campaign
     WHERE campaign.id = ${campaignId}
       AND segments.date BETWEEN '${since}' AND '${until}'`
  );

  let costMicros = 0, impressions = 0, clicks = 0, conversions = 0, conversionValue = 0;
  for (const row of rows) {
    const m = row.metrics;
    if (!m) continue;
    costMicros += Number(m.cost_micros ?? 0);
    impressions += Number(m.impressions ?? 0);
    clicks += Number(m.clicks ?? 0);
    conversions += Number(m.conversions ?? 0);
    conversionValue += Number(m.conversions_value ?? 0);
  }

  const spend = costMicros / 1_000_000;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;
  return { spend, impressions, clicks, ctr, conversions, conversionValue, roas };
}
