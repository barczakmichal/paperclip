import { describe, expect, it } from "vitest";
import type { ChannelMessage, ChannelMemberStatus } from "@paperclipai/shared";
import {
  AGENT_WORKING_TIMEOUT_MS,
  computeWorkingAgents,
  detectActiveMention,
  filterMentionCandidates,
} from "./Channels";

function msg(partial: Partial<ChannelMessage>): ChannelMessage {
  return {
    id: Math.random().toString(36).slice(2),
    channelId: "ch",
    kind: "message",
    body: "",
    authorUserId: null,
    authorAgentId: null,
    mentionedAgentIds: [],
    triggeredRunId: null,
    createdAt: new Date(0).toISOString(),
    ...partial,
  };
}

const nameFor = (id: string) => ({ a1: "CMO", a2: "CTO" }[id] ?? null);

describe("computeWorkingAgents", () => {
  const T0 = 1_000_000;

  it("pokazuje agenta po @mention bez jeszcze odpowiedzi", () => {
    const messages = [
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0).toISOString() }),
    ];
    const out = computeWorkingAgents(messages, nameFor, T0 + 5_000);
    expect(out).toEqual([{ agentId: "a1", name: "CMO" }]);
  });

  it("znika gdy agent odpowiedział po wzmiance", () => {
    const messages = [
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0).toISOString() }),
      msg({ kind: "agent_reply", authorAgentId: "a1", createdAt: new Date(T0 + 2_000).toISOString() }),
    ];
    expect(computeWorkingAgents(messages, nameFor, T0 + 5_000)).toEqual([]);
  });

  it("nadal czeka, gdy odpowiedział INNY agent", () => {
    const messages = [
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0).toISOString() }),
      msg({ kind: "agent_reply", authorAgentId: "a2", createdAt: new Date(T0 + 2_000).toISOString() }),
    ];
    expect(computeWorkingAgents(messages, nameFor, T0 + 5_000)).toEqual([{ agentId: "a1", name: "CMO" }]);
  });

  it("wygasa po oknie czasowym (agent nie odpowiedział w kanale)", () => {
    const messages = [
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0).toISOString() }),
    ];
    expect(computeWorkingAgents(messages, nameFor, T0 + AGENT_WORKING_TIMEOUT_MS + 1)).toEqual([]);
  });

  it("używa najnowszej wzmianki danego agenta", () => {
    const messages = [
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0).toISOString() }),
      msg({ kind: "agent_reply", authorAgentId: "a1", createdAt: new Date(T0 + 1_000).toISOString() }),
      // ponowna wzmianka po odpowiedzi → znów czekamy
      msg({ kind: "message", mentionedAgentIds: ["a1"], createdAt: new Date(T0 + 2_000).toISOString() }),
    ];
    expect(computeWorkingAgents(messages, nameFor, T0 + 3_000)).toEqual([{ agentId: "a1", name: "CMO" }]);
  });
});

describe("detectActiveMention", () => {
  it("wykrywa @ na początku", () => {
    expect(detectActiveMention("@c", 2)).toEqual({ query: "c", start: 0, end: 2 });
  });

  it("wykrywa @ po spacji", () => {
    expect(detectActiveMention("hej @CM", 7)).toEqual({ query: "CM", start: 4, end: 7 });
  });

  it("ignoruje @ w środku słowa (e-mail)", () => {
    expect(detectActiveMention("a@b", 3)).toBeNull();
  });

  it("zamyka się po spacji w tokenie", () => {
    expect(detectActiveMention("@CMO ", 5)).toBeNull();
  });

  it("zwraca null bez @", () => {
    expect(detectActiveMention("hello", 5)).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  const members: Pick<ChannelMemberStatus, "agentId" | "name" | "role">[] = [
    { agentId: "a1", name: "CMO", role: "cmo" },
    { agentId: "a2", name: "CTO", role: "cto" },
    { agentId: "a3", name: "Head of Product", role: "pm" },
  ];

  it("pusty query zwraca wszystkich", () => {
    expect(filterMentionCandidates(members, "")).toHaveLength(3);
  });

  it("filtruje po nazwie (case-insensitive, substring)", () => {
    expect(filterMentionCandidates(members, "cmo").map((m) => m.name)).toEqual(["CMO"]);
    // substring match — "duct" trafia w "Product"
    expect(filterMentionCandidates(members, "duct").map((m) => m.name)).toEqual(["Head of Product"]);
  });

  it("filtruje po roli", () => {
    expect(filterMentionCandidates(members, "pm").map((m) => m.name)).toEqual(["Head of Product"]);
  });
});
