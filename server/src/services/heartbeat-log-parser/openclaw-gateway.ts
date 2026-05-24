import type { AdapterLogParser } from "./types.js";

export const openclawGatewayParser: AdapterLogParser = {
  parse: (_chunk, prev) => ({ signals: [], next: prev }),
};
