/**
 * marketing.propose_campaign — creates a brief via Claude and saves a
 * campaign_proposal row to DB. Does NOT publish to Meta/Google.
 */
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";
import { campaignProposals } from "@paperclipai/db";
import { generateBrief } from "../creative/brief-generator.js";

interface ProposeCampaignParams {
  platform: "meta" | "google";
  goal: "sales" | "awareness" | "leads";
  product_ids: string[];
  budget_daily_pln: number;
  duration_days: number;
  audience_brief?: string;
}

export function registerProposeCampaignTool(ctx: PluginContext, db: Db): void {
  ctx.tools.register(
    "marketing.propose_campaign",
    {
      displayName: "Propose Marketing Campaign",
      description:
        "Creates a campaign proposal with AI-generated brief. Saves to DB as draft. Does NOT publish to Meta/Google — use submit_for_approval first.",
      parametersSchema: {
        type: "object",
        required: [
          "platform",
          "goal",
          "product_ids",
          "budget_daily_pln",
          "duration_days",
        ],
        properties: {
          platform: { type: "string", enum: ["meta", "google"] },
          goal: { type: "string", enum: ["sales", "awareness", "leads"] },
          product_ids: { type: "array", items: { type: "string" } },
          budget_daily_pln: { type: "number" },
          duration_days: { type: "integer", minimum: 1, maximum: 90 },
          audience_brief: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as ProposeCampaignParams;
      try {
        const anthropicKey = await ctx.secrets.resolve(
          "marketing-ai/anthropic/api_key",
        );
        const company = await ctx.companies.get(runCtx.companyId);
        const brandKit =
          (
            company as unknown as {
              brandKitJson?: Record<string, unknown>;
            } | null
          )?.brandKitJson ?? {};

        // Build minimal product stubs for brief generation.
        // Full product data lives in shop-catalog; agent calls list_products first.
        const briefProducts = p.product_ids.map((id) => ({
          id,
          title: id,
          price: "0",
          imageUrls: [],
          stock: 0,
        }));

        const brief = await generateBrief({
          products: briefProducts,
          goal: p.goal,
          audienceBrief: p.audience_brief ?? "",
          brandKit,
          anthropicApiKey: anthropicKey,
        });

        const [proposal] = await db
          .insert(campaignProposals)
          .values({
            companyId: runCtx.companyId,
            agentId: runCtx.agentId,
            platform: p.platform,
            goal: p.goal,
            status: "draft",
            productIds: p.product_ids,
            budgetDailyPln: String(p.budget_daily_pln),
            durationDays: p.duration_days,
            audienceBrief: p.audience_brief,
            briefJson: brief as unknown as Record<string, unknown>,
            adSets: [],
          })
          .returning();

        return {
          ok: true,
          content: `Campaign proposal created (id: ${proposal!.id}).`,
          data: { campaign_proposal: proposal, brief },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to create proposal: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
