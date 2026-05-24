/**
 * marketing.generate_creative — runs the full brief→copy→image pipeline
 * for a given proposal and persists rows in `creatives`.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Db } from "@paperclipai/db";
import { campaignProposals, creatives } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { generateCopy } from "../creative/copy-generator.js";
import { composeImage, type CreativeFormat } from "../creative/image-composer.js";
import type { Brief } from "../creative/brief-generator.js";

interface GenerateCreativeParams {
  proposal_id: string;
  format: "single_image" | "carousel";
  headline_count?: number;
  body_count?: number;
}

function pickImageFormat(
  format: string,
  platform: string,
): CreativeFormat {
  if (format === "single_image" && platform === "meta") return "1.91:1";
  if (format === "carousel") return "1:1";
  return "1:1";
}

export function registerGenerateCreativeTool(ctx: PluginContext, db: Db): void {
  ctx.tools.register(
    "marketing.generate_creative",
    {
      displayName: "Generate Campaign Creative",
      description:
        "Generates ad copy (Claude) + composed image (sharp/GPT-Image-1) for a proposal. Saves to creatives table.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "format"],
        properties: {
          proposal_id: { type: "string" },
          format: { type: "string", enum: ["single_image", "carousel"] },
          headline_count: { type: "integer", minimum: 1, maximum: 10 },
          body_count: { type: "integer", minimum: 1, maximum: 5 },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as GenerateCreativeParams;
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

        const anthropicKey = await ctx.secrets.resolve(
          "marketing-ai/anthropic/api_key",
        );
        const openaiKey = await ctx.secrets.resolve(
          "marketing-ai/openai/api_key",
        );

        const brief = (proposal.briefJson ?? {}) as unknown as Brief;

        const copy = await generateCopy({
          brief,
          platform: proposal.platform as "meta" | "google",
          headlineCount: p.headline_count,
          bodyCount: p.body_count,
          anthropicApiKey: anthropicKey,
        });

        const imageFormat = pickImageFormat(p.format, proposal.platform);
        const outputPath = path.join(
          os.tmpdir(),
          `creative-${randomUUID()}.jpg`,
        );

        // MVP: placeholder product image. Production impl fetches from catalog.
        const productImageUrl =
          imageFormat === "1.91:1"
            ? "https://placehold.co/1200x628/png"
            : "https://placehold.co/1080x1080/png";

        let imageUrl = productImageUrl;
        let composeError: string | undefined;

        try {
          const composed = await composeImage({
            productImageUrl,
            brief,
            format: imageFormat,
            outputPath,
            openaiApiKey: openaiKey,
          });
          imageUrl = `file://${composed.path}`;
        } catch (imgErr) {
          composeError =
            imgErr instanceof Error ? imgErr.message : String(imgErr);
          ctx.logger.warn("Image composition failed — creative saved without image", {
            proposalId: p.proposal_id,
            error: composeError,
          });
        }

        const [creative] = await db
          .insert(creatives)
          .values({
            companyId: runCtx.companyId,
            proposalId: p.proposal_id,
            format: p.format,
            status: composeError ? "incomplete" : "complete",
            imageUrl,
            headlines: copy.headlines,
            bodies: copy.primaryTexts,
            descriptions: copy.descriptions,
            cta: copy.cta,
            briefJson: brief as unknown as Record<string, unknown>,
            errorDetail: composeError,
          })
          .returning();

        return {
          ok: true,
          content: `Creative generated (id: ${creative!.id}, status: ${creative!.status}).`,
          data: {
            creatives: [
              {
                id: creative!.id,
                image_url: imageUrl,
                headlines: copy.headlines,
                bodies: copy.primaryTexts,
                cta: copy.cta,
              },
            ],
          },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to generate creative: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
