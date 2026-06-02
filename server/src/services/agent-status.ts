import { CHANNEL_STATUS_MAX_CHARS, type AgentOnlineStatus } from "@paperclipai/shared";

export function truncateByCodePoint(value: string, max: number): string {
  const cp = [...value];
  return cp.length <= max ? value : cp.slice(0, max).join("");
}

export function composeAgentStatusReport(input: {
  now: string | null;
  last: string | null;
  online: AgentOnlineStatus;
}): string {
  const parts: string[] = [];
  if (input.now) parts.push(`Teraz: ${input.now}`);
  if (input.last) parts.push(`Ostatnio: ${input.last}`);
  const text = parts.join(". ").trim();
  const composed = text ? `${text}.` : "Bezczynny.";
  return truncateByCodePoint(composed, CHANNEL_STATUS_MAX_CHARS);
}
