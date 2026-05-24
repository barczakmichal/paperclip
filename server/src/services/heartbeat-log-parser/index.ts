import { claudeLocalParser } from "./claude-local.js";
import { openclawGatewayParser } from "./openclaw-gateway.js";
import { genericParser } from "./generic.js";
import type { AdapterLogParser } from "./types.js";

export { initialParserState } from "./types.js";
export type { ParsedSignal, ParserState, SignalKind, AdapterLogParser } from "./types.js";

const parsersByAdapter: Record<string, AdapterLogParser> = {
  "claude-local": claudeLocalParser,
  "openclaw-gateway": openclawGatewayParser,
};

export function getLogParserFor(adapterId: string): AdapterLogParser {
  return parsersByAdapter[adapterId] ?? genericParser;
}
