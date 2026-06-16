import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useCompany } from "../context/CompanyContext";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import type { Agent } from "@paperclipai/shared";
import { MarkdownBody } from "../components/MarkdownBody";
import { ChatComposer, type ChatComposerHandle } from "../components/ChatComposer";
import { AgentIcon } from "../components/AgentIconPicker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDateTime } from "../lib/utils";

/**
 * Czat z agentami — jedno miejsce, w którym operator rozmawia z konkretnymi
 * agentami (CEO/CMO/CTO…): pyta „nad czym pracujesz?", agent się budzi i
 * odpowiada. W odróżnieniu od Conference Room (BoardChat = jeden concierge),
 * tutaj każda wiadomość trafia do WYBRANEGO agenta.
 *
 * Mechanizm (reużywa istniejącego backendu, zero zmian po stronie serwera):
 * - dla każdego agenta utrzymujemy stały wątek = issue przypisane do agenta
 *   (tytuł z prefiksem CHAT_TITLE_PREFIX),
 * - wysłanie wiadomości = komentarz na tym issue (reopen=true) + wakeup agenta,
 * - odpowiedzi agenta to komentarze (authorAgentId) — odpytujemy je co 3 s.
 */

const CHAT_TITLE_PREFIX = "💬 Rozmowa z operatorem";

function chatTitleFor(agent: Agent): string {
  return `${CHAT_TITLE_PREFIX} — ${agent.name}`;
}

function isChatIssueTitle(title: string): boolean {
  return title.startsWith(CHAT_TITLE_PREFIX);
}

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()) || "A";
}

export function AgentChat() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const composerRef = useRef<ChatComposerHandle>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  // --- Agenci ---------------------------------------------------------------
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? ""),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated"),
    [agents],
  );

  // Domyślnie wybierz CEO (lub pierwszego), kiedy lista się załaduje.
  useEffect(() => {
    if (selectedAgentId && activeAgents.some((a) => a.id === selectedAgentId)) return;
    if (activeAgents.length === 0) return;
    const ceo = activeAgents.find((a) => a.role === "ceo");
    setSelectedAgentId((ceo ?? activeAgents[0]).id);
  }, [activeAgents, selectedAgentId]);

  const selectedAgent = useMemo(
    () => activeAgents.find((a) => a.id === selectedAgentId) ?? null,
    [activeAgents, selectedAgentId],
  );

  // --- Żywe uruchomienia (kropka „na żywo") ---------------------------------
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId ?? ""),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const liveAgentIds = useMemo(
    () => new Set((liveRuns ?? []).map((r) => r.agentId)),
    [liveRuns],
  );

  // --- Wątek (issue) wybranego agenta ---------------------------------------
  const { data: agentIssues } = useQuery({
    queryKey: ["agent-chat", "issues", selectedCompanyId ?? "", selectedAgentId ?? ""],
    queryFn: () => issuesApi.list(selectedCompanyId!, { assigneeAgentId: selectedAgentId! }),
    enabled: !!selectedCompanyId && !!selectedAgentId,
  });

  const activeIssueId = useMemo(() => {
    const matches = (agentIssues ?? [])
      .filter((i) => isChatIssueTitle(i.title) && i.status !== "cancelled")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches[0]?.id ?? null;
  }, [agentIssues]);

  // --- Komentarze (wiadomości) ----------------------------------------------
  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(activeIssueId ?? ""),
    queryFn: () => issuesApi.listComments(activeIssueId!, { order: "asc" }),
    enabled: !!activeIssueId,
    refetchInterval: 3000,
  });

  const messages = useMemo(
    () =>
      (comments ?? [])
        .filter((c) => !c.deletedAt && c.body && c.body.trim().length > 0)
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [comments],
  );

  // Autoscroll na dół przy nowych wiadomościach.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selectedAgentId]);

  // --- Wysyłka --------------------------------------------------------------
  const sendMutation = useMutation({
    mutationFn: async ({ agent, body }: { agent: Agent; body: string }) => {
      if (!selectedCompanyId) throw new Error("Brak wybranej firmy");

      // 1) Znajdź lub utwórz stały wątek przypisany do agenta.
      let issueId = activeIssueId;
      if (!issueId) {
        const created = await issuesApi.create(selectedCompanyId, {
          title: chatTitleFor(agent),
          description:
            "Stały wątek rozmowy operatora z agentem (Czat z agentami). " +
            "Odpowiadaj konwersacyjnie na pytania operatora o bieżącą pracę.",
          assigneeAgentId: agent.id,
          status: "todo",
          priority: "medium",
        });
        issueId = created.id;
        queryClient.invalidateQueries({
          queryKey: ["agent-chat", "issues", selectedCompanyId, agent.id],
        });
      }

      // 2) Dodaj wiadomość jako komentarz (reopen budzi zamknięty wątek).
      await issuesApi.addComment(issueId, body, true);

      // 3) Obudź agenta (best-effort — sam komentarz też budzi przypisanego agenta).
      try {
        await agentsApi.wakeup(
          agent.id,
          {
            source: "on_demand",
            triggerDetail: "manual",
            reason: "Wiadomość z czatu z agentem",
            payload: { issueId },
          },
          selectedCompanyId,
        );
      } catch {
        /* wakeup best-effort — komentarz już zlecił przebudzenie */
      }

      return issueId;
    },
    onSuccess: (issueId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
    },
  });

  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body || !selectedAgent || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate({ agent: selectedAgent, body });
  }, [input, selectedAgent, sendMutation]);

  const agentLive = selectedAgent ? liveAgentIds.has(selectedAgent.id) : false;

  return (
    <div className="flex h-full min-h-0">
      {/* Lista agentów */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="px-4 h-12 flex items-center border-b border-border">
          <h2 className="text-sm font-semibold">Agenci</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-0.5">
          {activeAgents.map((agent) => {
            const isSel = agent.id === selectedAgentId;
            const live = liveAgentIds.has(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  isSel ? "bg-accent text-foreground" : "hover:bg-accent/50 text-foreground/80",
                )}
              >
                <span className="relative">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[11px]">
                      {agent.icon ? (
                        <AgentIcon icon={agent.icon} className="h-3.5 w-3.5" />
                      ) : (
                        agentInitials(agent.name)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {live ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{agent.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {live ? "Na żywo" : agent.title || agent.role}
                  </span>
                </span>
              </button>
            );
          })}
          {activeAgents.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Brak agentów.</p>
          ) : null}
        </div>
      </aside>

      {/* Wątek rozmowy */}
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-4 h-12 flex items-center gap-2 border-b border-border">
          {selectedAgent ? (
            <>
              <span className="relative">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {selectedAgent.icon ? (
                      <AgentIcon icon={selectedAgent.icon} className="h-3 w-3" />
                    ) : (
                      agentInitials(selectedAgent.name)
                    )}
                  </AvatarFallback>
                </Avatar>
                {agentLive ? (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                ) : null}
              </span>
              <span className="text-sm font-semibold">{selectedAgent.name}</span>
              <span className="text-xs text-muted-foreground">
                {agentLive ? "pracuje teraz" : selectedAgent.title || selectedAgent.role}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Wybierz agenta</span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {!selectedAgent ? null : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                Napisz do <span className="font-medium text-foreground">{selectedAgent.name}</span>,
                np. „Nad czym teraz pracujesz?". Agent zostanie obudzony i odpowie tutaj.
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {messages.map((c) => {
                const fromAgent = !!c.authorAgentId;
                return (
                  <div
                    key={c.id}
                    className={cn("flex flex-col gap-1", fromAgent ? "items-start" : "items-end")}
                  >
                    {fromAgent ? (
                      <span className="px-1 text-xs font-medium text-muted-foreground">
                        {selectedAgent.name}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[85%] break-words rounded-2xl px-3.5 py-2 text-sm",
                        fromAgent
                          ? "bg-muted text-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      <MarkdownBody
                        className="max-w-full overflow-visible [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                        softBreaks
                      >
                        {c.body}
                      </MarkdownBody>
                    </div>
                    <span
                      className="px-1 text-[11px] text-muted-foreground"
                      title={formatDateTime(c.createdAt)}
                    >
                      {formatDateTime(c.createdAt)}
                    </span>
                  </div>
                );
              })}
              {agentLive ? (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {selectedAgent.name} pracuje…
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer
              ref={composerRef}
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              placeholder={
                selectedAgent
                  ? `Napisz do ${selectedAgent.name}…`
                  : "Wybierz agenta, aby zacząć rozmowę"
              }
              submitKey="enter"
              submitting={sendMutation.isPending}
              disabled={!selectedAgent}
              sendLabel="Wyślij wiadomość"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
