import type { AdapterLogParser } from "./types.js";

export const genericParser: AdapterLogParser = {
  parse: (_chunk, prev) => ({ signals: [], next: prev }),
};
