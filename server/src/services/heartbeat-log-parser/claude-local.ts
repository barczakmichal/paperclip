import type { AdapterLogParser } from "./types.js";

export const claudeLocalParser: AdapterLogParser = {
  parse: (_chunk, prev) => ({ signals: [], next: prev }),
};
