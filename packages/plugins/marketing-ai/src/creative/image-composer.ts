import sharp from "sharp";
import { OpenAI } from "openai";
import type { Brief } from "./brief-generator.js";

// format → [width, height] in pixels
const DIMENSIONS: Record<string, [number, number]> = {
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "1.91:1": [1200, 628],
  "9:16": [1080, 1920],
};

export type CreativeFormat = keyof typeof DIMENSIONS;

export interface ComposeImageInput {
  productImageUrl: string;
  brief: Brief;
  format: CreativeFormat;
  outputPath: string;
  openaiApiKey: string;
  // Injectable for tests
  _openaiClient?: unknown;
  _fetchFn?: typeof fetch;
}

export interface ComposeImageResult {
  path: string;
  width: number;
  height: number;
  usedGenAI: boolean;
}

async function fetchBuffer(url: string, fetchFn: typeof fetch): Promise<Buffer> {
  const res = await fetchFn(url);
  return Buffer.from(await res.arrayBuffer());
}

export async function composeImage(input: ComposeImageInput): Promise<ComposeImageResult> {
  const dims = DIMENSIONS[input.format] ?? DIMENSIONS["1:1"];
  const [width, height] = dims;
  const fetchFn = input._fetchFn ?? fetch;
  const needsBackground = input.format === "1.91:1";

  const productBuf = await fetchBuffer(input.productImageUrl, fetchFn);

  if (!needsBackground) {
    // Simple crop/resize — no gen-AI
    await sharp(productBuf)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFile(input.outputPath);
    return { path: input.outputPath, width, height, usedGenAI: false };
  }

  // Banner — generate AI background, then composite product on top
  const openai = (input._openaiClient as OpenAI | undefined)
    ?? new OpenAI({ apiKey: input.openaiApiKey });

  const bgPrompt = [
    `Background scene for a ${input.brief.positioning} ad.`,
    `Tone: ${input.brief.tone}.`,
    "Clean, photorealistic, no text.",
    `Aspect ratio 1.91:1, ${width}x${height}px.`,
  ].join(" ");

  const bgResponse = await openai.images.generate({
    model: "gpt-image-1",
    prompt: bgPrompt,
    size: "1792x1024", // closest available to 1.91:1
    n: 1,
  });

  const bgUrl = bgResponse.data?.[0]?.url;
  if (!bgUrl) throw new Error("GPT-Image-1 returned no image URL");

  const bgBuf = await fetchBuffer(bgUrl, fetchFn);

  // Resize product to 60% of banner height, center it
  const productHeight = Math.round(height * 0.6);
  const productResized = await sharp(productBuf)
    .resize(undefined, productHeight, { fit: "inside" })
    .toBuffer();

  const meta = await sharp(productResized).metadata();
  const left = Math.round((width - (meta.width ?? 0)) / 2);
  const top = Math.round((height - productHeight) / 2);

  await sharp(bgBuf)
    .resize(width, height, { fit: "cover" })
    .composite([{ input: productResized, left, top }])
    .toFile(input.outputPath);

  return { path: input.outputPath, width, height, usedGenAI: true };
}
