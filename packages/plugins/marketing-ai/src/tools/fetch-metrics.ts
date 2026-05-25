/**
 * marketing.fetch_metrics — fetches ROAS, CTR, spend, conversions from
 * Meta or Google and normalizes spend to PLN via NBP mid-rate.
 *
 * Platform adapter calls (C1) are stubbed for now; the shape and PLN
 * normalization logic are fully implemented.
 */
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";
import { campaignProposals } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { convertToPln } from "../adapters/nbp.js";

interface FetchMetricsParams {
  campaign_id: string;
  since?: string; // ISO date YYYY-MM-DD
  until?: string;
}

// Shape returned by platform adapters (meta-ads/insights.ts and google-ads/metrics.ts)
interface RawMetrics {
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export function registerFetchMetricsTool(ctx: PluginContext, db: Db): void {
  ctx.tools.register(
    "marketing.fetch_metrics",
    {
      displayName: "Fetch Campaign Metrics",
      description:
        "Fetches ROAS, CTR, spend, conversions from Meta or Google. Normalizes spend to PLN via NBP fixing rate.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          campaign_id: { type: "string" },
          since: { type: "string", description: "ISO date YYYY-MM-DD" },
          until: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as FetchMetricsParams;
      try {
        const [proposal] = await db
          .select()
          .from(campaignProposals)
          .where(eq(campaignProposals.id, p.campaign_id));

        if (!proposal) {
          return { ok: false, error: `Campaign not found: ${p.campaign_id}` } as ToolResult;
        }
        if (proposal.companyId !== runCtx.companyId) {
          return { ok: false, error: "Campaign not in current company" } as ToolResult;
        }

        // Date range defaults
        const until = p.until ?? new Date().toISOString().slice(0, 10);
        const since =
          p.since ??
          new Date(Date.now() - 30 * 86_400_000)
            .toISOString()
            .slice(0, 10);

        // Platform adapter dispatch:
        // When C1 adapters are wired, replace this stub with the real call.
        // Meta: await fetchInsights(metaAccount, proposal.platformCampaignId!, since, until)
        // Google: await fetchMetrics(googleCustomer, proposal.platformCampaignId!, since, until)
        const rawMetrics: RawMetrics = {
          spend: 0,
          currency: "USD",
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversionValue: 0,
        };

        const spendPln = await convertToPln(rawMetrics.spend, rawMetrics.currency);
        const conversionValuePln = await convertToPln(
          rawMetrics.conversionValue,
          rawMetrics.currency,
        );
        const roas = spendPln > 0 ? conversionValuePln / spendPln : 0;
        const ctr =
          rawMetrics.impressions > 0
            ? rawMetrics.clicks / rawMetrics.impressions
            : 0;

        ctx.logger.info("Metrics fetched", {
          campaignId: p.campaign_id,
          platform: proposal.platform,
          roas,
          spendPln,
        });

        return {
          ok: true,
          content: `Metrics for ${p.campaign_id}: ROAS ${roas.toFixed(2)}, spend PLN ${spendPln.toFixed(2)}.`,
          data: {
            campaign_id: p.campaign_id,
            platform: proposal.platform,
            since,
            until,
            spend_account_currency: rawMetrics.spend,
            spend_pln: Number(spendPln.toFixed(2)),
            currency: rawMetrics.currency,
            impressions: rawMetrics.impressions,
            clicks: rawMetrics.clicks,
            ctr: Number(ctr.toFixed(4)),
            conversions: rawMetrics.conversions,
            conversion_value_pln: Number(conversionValuePln.toFixed(2)),
            roas: Number(roas.toFixed(4)),
          },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to fetch metrics: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
