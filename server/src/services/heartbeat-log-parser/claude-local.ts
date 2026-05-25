import type { AdapterLogParser, ParsedSignal, ParserState } from "./types.js";

// Anthropic pricing (USD per million tokens, approximate; updated periodically).
// We don't know the exact model from the stream, so use Opus 4.7 output rate as conservative default.
const COST_PER_OUTPUT_TOKEN_USD = 75 / 1_000_000;
const COST_PER_INPUT_TOKEN_USD = 15 / 1_000_000;

// Internal parser state: extends ParserState with per-content-block accumulators.
interface ClaudeParserState extends ParserState {
  activeBlocks: Record<number, { kind: "text" | "tool_use"; text: string; toolName?: string }>;
}

function asState(prev: ParserState): ClaudeParserState {
  if ("activeBlocks" in prev) return prev as ClaudeParserState;
  return { buffer: prev.buffer, activeBlocks: {} };
}

function tryParseDataLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice("data: ".length).trim();
  if (!payload) return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const claudeLocalParser: AdapterLogParser = {
  parse: (chunk, prev) => {
    const state = asState(prev);
    const combined = state.buffer + chunk;
    const lastNewline = combined.lastIndexOf("\n");
    const completed = lastNewline >= 0 ? combined.slice(0, lastNewline) : "";
    const remaining = lastNewline >= 0 ? combined.slice(lastNewline + 1) : combined;

    const signals: ParsedSignal[] = [];
    const blocks = { ...state.activeBlocks };

    for (const line of completed.split("\n")) {
      const data = tryParseDataLine(line);
      if (!data) continue;
      const type = typeof data.type === "string" ? data.type : null;
      if (!type) continue;

      if (type === "content_block_start") {
        const index = typeof data.index === "number" ? data.index : -1;
        const cb = data.content_block as { type?: string; name?: string } | undefined;
        if (index < 0 || !cb) continue;
        if (cb.type === "text") {
          blocks[index] = { kind: "text", text: "" };
        } else if (cb.type === "tool_use" && typeof cb.name === "string") {
          blocks[index] = { kind: "tool_use", text: "", toolName: cb.name };
          signals.push({ kind: "tool_start", toolName: cb.name });
        }
      } else if (type === "content_block_delta") {
        const index = typeof data.index === "number" ? data.index : -1;
        const delta = data.delta as { type?: string; text?: string } | undefined;
        if (index < 0 || !delta) continue;
        // Lazily initialize text block if content_block_start was not seen (e.g. split across calls or noise before it)
        if (!blocks[index]) {
          blocks[index] = { kind: "text", text: "" };
        }
        const block = blocks[index];
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          block.text += delta.text;
        }
      } else if (type === "content_block_stop") {
        const index = typeof data.index === "number" ? data.index : -1;
        if (index < 0) continue;
        const block = blocks[index];
        if (!block) continue;
        if (block.kind === "text" && block.text.length > 0) {
          signals.push({ kind: "thought", text: block.text });
        } else if (block.kind === "tool_use" && block.toolName) {
          signals.push({ kind: "tool_end", toolName: block.toolName });
        }
        delete blocks[index];
      } else if (type === "message_delta") {
        const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (!usage) continue;
        const inputCost = (usage.input_tokens ?? 0) * COST_PER_INPUT_TOKEN_USD;
        const outputCost = (usage.output_tokens ?? 0) * COST_PER_OUTPUT_TOKEN_USD;
        const total = inputCost + outputCost;
        if (total > 0) {
          signals.push({ kind: "cost", costUsd: total });
        }
      }
      // message_start, message_stop, ping, etc. — ignored
    }

    return {
      signals,
      next: { buffer: remaining, activeBlocks: blocks } as ParserState,
    };
  },
};
