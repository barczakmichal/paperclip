import type { AdapterLogParser, ParsedSignal, ParserState } from "./types.js";

// OpenClaw gateway stdout format (as emitted by packages/adapters/openclaw-gateway/src/server/execute.ts):
//
//   [openclaw-gateway] <message>                                — lifecycle log lines
//   [openclaw-gateway:event] run=<id> stream=<name> data=<json> — structured agent events
//
// Known stream values: "assistant" (delta|text), "error" (error|message),
//                      "lifecycle" (phase + optional message).
//
// The gateway adapter does not expose per-token thought blocks, tool_start/tool_end
// transitions, or cost information via stdout. Those signals are only available in
// the final result payload processed by execute.ts at the server layer.
//
// This parser understands the line format so it is ready for future extension
// (e.g. when stream=thinking or stream=tool_start are added), but currently emits
// no live-ops signals because the format does not carry them.

const EVENT_PREFIX = "[openclaw-gateway:event]";
const EVENT_PATTERN = /^\[openclaw-gateway:event\]\s+run=[^\s]+\s+stream=([^\s]+)\s+data=(.*)$/s;

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text.trim());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function processLine(_line: string): ParsedSignal[] {
  // Currently the OpenClaw gateway stdout does not carry live-ops signals.
  // Structured parsing is in place so future stream types can be handled here
  // without changing the parser interface.
  //
  // Example of how a future `stream=thinking` signal could be handled:
  //
  //   if (line.startsWith(EVENT_PREFIX)) {
  //     const match = line.match(EVENT_PATTERN);
  //     if (match) {
  //       const stream = match[1].toLowerCase();
  //       const data = safeJsonParse(match[2]);
  //       if (stream === "thinking" && data) {
  //         const text = typeof data.text === "string" ? data.text : "";
  //         if (text) return [{ kind: "thought", text }];
  //       }
  //     }
  //   }

  void EVENT_PREFIX;
  void EVENT_PATTERN;
  void safeJsonParse;

  return [];
}

export const openclawGatewayParser: AdapterLogParser = {
  parse(chunk: string, prev: ParserState): { signals: ParsedSignal[]; next: ParserState } {
    const combined = prev.buffer + chunk;
    const lastNewline = combined.lastIndexOf("\n");
    const completed = lastNewline >= 0 ? combined.slice(0, lastNewline) : "";
    const remaining = lastNewline >= 0 ? combined.slice(lastNewline + 1) : combined;

    const signals: ParsedSignal[] = [];
    if (completed) {
      for (const line of completed.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        signals.push(...processLine(trimmed));
      }
    }

    return {
      signals,
      next: { buffer: remaining },
    };
  },
};
