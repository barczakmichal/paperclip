import Anthropic from "@anthropic-ai/sdk";
import type { Brief } from "./brief-generator.js";

export interface CopyOutput {
  headlines: string[];
  primaryTexts: string[];
  descriptions: string[];
  cta: string;
}

export interface GenerateCopyInput {
  brief: Brief;
  platform: "meta" | "google";
  headlineCount?: number;
  bodyCount?: number;
  anthropicApiKey: string;
}

function validateCopy(copy: CopyOutput, doNots: string[]): void {
  const allText = [
    ...copy.headlines,
    ...copy.primaryTexts,
    ...copy.descriptions,
    copy.cta,
  ].join(" ").toLowerCase();

  for (const forbidden of doNots) {
    if (allText.includes(forbidden.toLowerCase())) {
      throw new Error(`do-not phrase found in generated copy: "${forbidden}"`);
    }
  }
}

export async function generateCopy(input: GenerateCopyInput): Promise<CopyOutput> {
  const client = new Anthropic({ apiKey: input.anthropicApiKey });
  const headlineCount = input.headlineCount ?? 5;
  const bodyCount = input.bodyCount ?? 3;

  const platformInstructions = input.platform === "meta"
    ? "Meta Ads: headlines max 40 chars, primary texts max 125 chars, descriptions max 30 chars."
    : "Google Ads: headlines max 30 chars, descriptions max 90 chars. No primary texts needed (use descriptions).";

  const userPrompt = `Write ad copy for this campaign.
Brief: ${JSON.stringify(input.brief)}
Platform: ${input.platform}. ${platformInstructions}

Return ONLY valid JSON with keys:
- headlines: string[${headlineCount}]
- primaryTexts: string[${bodyCount}]
- descriptions: string[${bodyCount}]
- cta: string`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text content in LLM response");

  const json = textBlock.text.replace(/^```json?\n?|```$/g, "").trim();
  const copy = JSON.parse(json) as CopyOutput;

  validateCopy(copy, input.brief.doNots ?? []);
  return copy;
}
