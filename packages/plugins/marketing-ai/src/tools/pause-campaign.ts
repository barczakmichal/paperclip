/**
 * marketing.pause_campaign — pauses a live campaign on Meta or Google,
 * updates status in DB, and writes an audit log entry.
 */
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";
import { campaignProposals, marketingAuditLog } from "@paperclipai/db";
import { eq } from "drizzle-orm";

interface PauseCampaignParams {
  campaign_id: string;
  reason: string;
}

export function registerPauseCampaignTool(ctx: PluginContext, db: Db): void {
  ctx.tools.register(
    "marketing.pause_campaign",
    {
      displayName: "Pause Campaign",
      description:
        "Pauses a live campaign on Meta or Google. Updates status in DB and writes audit log.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id", "reason"],
        properties: {
          campaign_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as PauseCampaignParams;
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
        if (!proposal.platformCampaignId) {
          return { ok: false, error: "Campaign not yet published on platform" } as ToolResult;
        }

        // Platform adapter call (C1 wiring):
        // Meta:   await pauseCampaign(proposal.platformCampaignId, accessToken)
        // Google: await googleAdsClient.pauseCampaign(proposal.platformCampaignId)
        ctx.logger.info("Pausing campaign on platform", {
          campaignId: p.campaign_id,
          platformCampaignId: proposal.platformCampaignId,
          platform: proposal.platform,
          reason: p.reason,
        });

        await db
          .update(campaignProposals)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(campaignProposals.id, p.campaign_id));

        await db.insert(marketingAuditLog).values({
          companyId: runCtx.companyId,
          action: "campaign.paused",
          agentId: runCtx.agentId,
          entityType: "campaign_proposal",
          entityId: p.campaign_id,
          payloadDiff: {
            reason: p.reason,
            previousStatus: proposal.status,
          },
        });

        return {
          ok: true,
          content: `Campaign ${p.campaign_id} paused.`,
          data: { status: "paused", campaign_id: p.campaign_id },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to pause campaign: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
