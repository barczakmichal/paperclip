export type SignalKind = "thought" | "tool_start" | "tool_end" | "cost";

export interface ParsedSignal {
  kind: SignalKind;
  text?: string;       // for "thought"
  toolName?: string;   // for "tool_start" / "tool_end"
  costUsd?: number;    // for "cost"
}

export interface ParserState {
  buffer: string;
}

export const initialParserState: ParserState = { buffer: "" };

export interface AdapterLogParser {
  parse(chunk: string, prev: ParserState): { signals: ParsedSignal[]; next: ParserState };
}
