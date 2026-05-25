import Anthropic from "@anthropic-ai/sdk";
import type { CatalogProduct } from "./shop-catalog.js";

export interface BrandKit {
  toneOfVoice?: string;
  doNots?: string[];
  mandatoryPhrases?: string[];
  [key: string]: unknown;
}

export interface Brief {
  positioning: string;
  tone: string;
  keyBenefits: string[];
  hooks: string[];
  doNots: string[];
}

export interface GenerateBriefInput {
  products: CatalogProduct[];
  goal: "sales" | "awareness" | "leads";
  audienceBrief: string;
  brandKit: BrandKit;
  anthropicApiKey: string;
}

export async function generateBrief(input: GenerateBriefInput): Promise<Brief> {
  const client = new Anthropic({ apiKey: input.anthropicApiKey });

  const systemPrompt = [
    "You are a senior advertising strategist.",
    input.brandKit.toneOfVoice ? `Brand tone: ${input.brandKit.toneOfVoice}.` : "",
    input.brandKit.doNots?.length
      ? `NEVER use these phrases: ${input.brandKit.doNots.join(", ")}.`
      : "",
  ].filter(Boolean).join(" ");

  const userPrompt = `Create an ad campaign brief as JSON.
Products: ${JSON.stringify(input.products.map((p) => ({ title: p.title, price: p.price })))}
Goal: ${input.goal}
Audience: ${input.audienceBrief}

Return ONLY valid JSON with keys: positioning (string), tone (string), keyBenefits (string[]), hooks (string[]), doNots (string[]).`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text content in LLM response");

  // Strip markdown code fence if present
  const json = textBlock.text.replace(/^```json?\n?|```$/g, "").trim();
  const parsed = JSON.parse(json) as Brief;
  if (!parsed.positioning) throw new Error("Brief missing required field: positioning");
  return parsed;
}
