export type ChannelKind = "department" | "company";
export type ChannelMessageKind = "message" | "agent_reply" | "system";
export type AgentOnlineStatus = "active" | "idle" | "paused" | "error";

export interface Channel {
  id: string;
  companyId: string;
  key: string;
  name: string;
  kind: ChannelKind;
  managerAgentId: string | null;
  // Backing issue kanału — leniwie tworzony przy pierwszym @mention (channels.backingIssueId).
  // null dopóki w kanale nie padła żadna wzmianka. list() robi select() wszystkich kolumn,
  // więc pole realnie leci w JSON; tu domykamy kontrakt typu.
  backingIssueId: string | null;
  archivedAt: string | null;
}

export interface ChannelMemberStatus {
  agentId: string;
  name: string;
  role: string;
  icon: string | null;
  online: AgentOnlineStatus;
  now: string | null;
  last: string | null;
  report: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  kind: ChannelMessageKind;
  body: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  mentionedAgentIds: string[];
  triggeredRunId: string | null;
  createdAt: string;
}
