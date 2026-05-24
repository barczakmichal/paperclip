/**
 * marketing.submit_for_approval — creates an Approval row (type:
 * "marketing_campaign") and transitions the proposal to pending_approval.
 */
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";
import { campaignProposals, approvals } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import type { MarketingCampaignApprovalPayload } from "../approval/payload.js";

interface SubmitForApprovalParams {
  proposal_id: string;
  creative_ids: string[];
  comments?: string;
}

export function registerSubmitForApprovalTool(ctx: PluginContext, db: Db): void {
  ctx.tools.register(
    "marketing.submit_for_approval",
    {
      displayName: "Submit Campaign for Approval",
      description:
        "Submits a campaign proposal + creatives for human review. Creates an Approval record visible in Paperclip UI.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "creative_ids"],
        properties: {
          proposal_id: { type: "string" },
          creative_ids: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          comments: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as SubmitForApprovalParams;
      try {
        const [proposal] = await db
          .select()
          .from(campaignProposals)
          .where(eq(campaignProposals.id, p.proposal_id));

        if (!proposal) {
          return { ok: false, error: `Proposal not found: ${p.proposal_id}` } as ToolResult;
        }
        if (proposal.companyId !== runCtx.companyId) {
          return { ok: false, error: "Proposal not in current company" } as ToolResult;
        }

        const approvalPayload: MarketingCampaignApprovalPayload = {
          proposalId: proposal.id,
          creativeIds: p.creative_ids,
          comments: p.comments,
          platform: proposal.platform,
          goal: proposal.goal,
          budgetDailyPln: String(proposal.budgetDailyPln),
          durationDays: proposal.durationDays,
          audienceBrief: proposal.audienceBrief ?? undefined,
        };

        const [approval] = await db
          .insert(approvals)
          .values({
            companyId: runCtx.companyId,
            type: "marketing_campaign",
            requestedByAgentId: runCtx.agentId,
            status: "pending",
            payload: approvalPayload as unknown as Record<string, unknown>,
          })
          .returning();

        // Link approval back to proposal and advance status
        await db
          .update(campaignProposals)
          .set({
            status: "pending_approval",
            approvalId: approval!.id,
            updatedAt: new Date(),
          })
          .where(eq(campaignProposals.id, proposal.id));

        return {
          ok: true,
          content: `Approval submitted (id: ${approval!.id}). Awaiting human review.`,
          data: { approval_id: approval!.id, status: "pending" },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to submit for approval: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
