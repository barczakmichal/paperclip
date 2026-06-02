import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveEvent } from "@paperclipai/shared";
import { useTranslation } from "react-i18next";
import { MessageSquare, Send } from "lucide-react";
import { channelsApi } from "@/api/channels";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Identity } from "../components/Identity";
import { AgentIcon } from "../components/AgentIconPicker";
import { MarkdownBody } from "../components/MarkdownBody";
import { cn } from "../lib/utils";
import type { Channel, ChannelMessage, ChannelMemberStatus } from "@paperclipai/shared";

// ── online status dot ─────────────────────────────────────────────────────────

const ONLINE_DOT: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-neutral-400",
  paused: "bg-amber-400",
  error: "bg-red-500",
};

function OnlineDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        ONLINE_DOT[status] ?? "bg-neutral-400",
      )}
      aria-label={status}
    />
  );
}

// ── channel list (left rail) ──────────────────────────────────────────────────

function ChannelRail({
  channels,
  activeId,
  onSelect,
}: {
  channels: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("channels");

  return (
    <aside className="w-52 shrink-0 border-r border-border flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t("channelsLabel", "Channels")}
        </span>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto py-1">
        {channels.map((ch) => (
          <button
            key={ch.id}
            type="button"
            onClick={() => onSelect(ch.id)}
            className={cn(
              "w-full text-left flex items-center gap-1.5 px-3 py-2 text-sm transition-colors",
              activeId === ch.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <span className="text-muted-foreground/60 shrink-0">#</span>
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── message bubble ────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: ChannelMessage }) {
  const { t } = useTranslation("channels");
  const isSystem = msg.kind === "system";
  const isAgent = msg.kind === "agent_reply";
  const isUser = msg.kind === "message";

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(msg.createdAt));

  if (isSystem) {
    return (
      <div className="flex items-center gap-2 py-1 px-3">
        <div className="flex-1 border-t border-border/40" />
        <span className="text-xs text-muted-foreground/60 shrink-0 italic">
          {msg.body}
        </span>
        <div className="flex-1 border-t border-border/40" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex gap-2.5 px-4 py-2 hover:bg-accent/30",
        isUser && "flex-row-reverse",
      )}
    >
      {/* Avatar side */}
      <div className="shrink-0 mt-0.5">
        {isAgent && msg.authorAgentId ? (
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <AgentIcon icon={null} className="h-4 w-4" />
          </div>
        ) : (
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
            U
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex-1", isUser && "flex flex-col items-end")}>
        <div className={cn("flex items-center gap-2 mb-0.5", isUser && "flex-row-reverse")}>
          <span className="text-xs font-medium">
            {isAgent
              ? t("agent", "Agent")
              : t("you", "You")}
          </span>
          <span className="text-xs text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-[85%]",
            isAgent && "bg-muted/60 text-foreground",
            isUser && "bg-primary text-primary-foreground",
          )}
        >
          <MarkdownBody
            className={cn(
              "prose-sm",
              isUser && "prose-invert [&_a]:text-primary-foreground/80",
            )}
            softBreaks
            linkIssueReferences={false}
          >
            {msg.body}
          </MarkdownBody>
        </div>
      </div>
    </div>
  );
}

// ── composer ──────────────────────────────────────────────────────────────────

function Composer({
  channelId,
  onSent,
}: {
  channelId: string;
  onSent: () => void;
}) {
  const { t } = useTranslation("channels");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await channelsApi.post(channelId, text);
      setValue("");
      onSent();
      textareaRef.current?.focus();
    } catch {
      // Keep the typed text so the user can retry without re-typing.
      setError(t("sendError", "Failed to send. Try again."));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="border-t border-border bg-background p-3 shrink-0">
      <p className="text-xs text-muted-foreground/60 mb-1.5">
        {t("mentionHint", "@AgentName triggers a run")}
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={2}
          className={cn(
            "flex-1 resize-none rounded-md border border-border bg-card px-3 py-2",
            "text-sm placeholder:text-muted-foreground/50",
            "focus:outline-none focus-visible:ring-ring focus-visible:ring-[2px]",
            "disabled:opacity-50",
          )}
          placeholder={t("composerPlaceholder", "Write a message… (Enter to send, Shift+Enter for newline)")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!value.trim() || sending}
          aria-label={t("sendButton", "Send")}
          data-testid="channel-send"
          className={cn(
            "shrink-0 flex items-center justify-center rounded-md h-9 w-9",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {error && (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ── center panel (messages) ────────────────────────────────────────────────────

function MessageStream({ channelId }: { channelId: string }) {
  const { t } = useTranslation("channels");
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading, isError } = useQuery({
    queryKey: queryKeys.channels.messages(channelId),
    queryFn: () => channelsApi.messages(channelId),
    enabled: !!channelId,
  });

  // scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function handleSent() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels.messages(channelId) });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* message list */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex flex-col gap-2 px-4 py-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-muted/50 animate-pulse"
                style={{ width: `${50 + (i * 17) % 40}%` }}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-full text-sm text-destructive py-12" role="alert">
            {t("loadError", "Failed to load.")}
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60 italic py-12">
            {t("noMessages", "No messages yet. Say hello!")}
          </div>
        ) : (
          <>
            {[...messages].reverse().map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <Composer channelId={channelId} onSent={handleSent} />
    </div>
  );
}

// ── member card ────────────────────────────────────────────────────────────────

/** Reports longer than this get a collapsed preview with an expand toggle. */
const REPORT_PREVIEW_CHARS = 120;

function MemberCard({ member }: { member: ChannelMemberStatus }) {
  const { t } = useTranslation("channels");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* header: identity + online dot */}
      <div className="flex items-center justify-between gap-2">
        <Identity name={member.name} size="sm" className="min-w-0 flex-1 truncate" />
        <OnlineDot status={member.online} />
      </div>

      {/* role */}
      <p className="text-xs text-muted-foreground capitalize">{member.role}</p>

      {/* now */}
      {member.now && (
        <div>
          <span className="text-xs font-medium text-muted-foreground/70">{t("nowLabel", "Teraz:")} </span>
          <span className="text-xs text-foreground">{member.now}</span>
        </div>
      )}

      {/* last */}
      {member.last && (
        <div>
          <span className="text-xs font-medium text-muted-foreground/70">{t("lastLabel", "Ostatnio:")} </span>
          <span className="text-xs text-muted-foreground">{member.last}</span>
        </div>
      )}

      {/* report */}
      {member.report && (
        <div>
          <p
            className={cn(
              "text-xs text-muted-foreground leading-relaxed",
              !expanded && "line-clamp-3",
            )}
          >
            {member.report}
          </p>
          {member.report.length > REPORT_PREVIEW_CHARS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-muted-foreground/60 hover:text-foreground mt-0.5"
            >
              {expanded ? t("showLess", "Show less") : t("showMore", "Show more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── right panel (members) ──────────────────────────────────────────────────────

function MembersPanel({ channelId }: { channelId: string }) {
  const { t } = useTranslation("channels");

  // POLLING FALLBACK: members are polled every 15 s so agent status stays fresh
  // even when the backend has not yet emitted channel.status.updated events.
  // The WebSocket handler in <Channels> will also invalidate this query on
  // channel.status.updated once the backend starts emitting it, so polling
  // can be relaxed or removed at that point. Messages are NOT polled here —
  // the WS channel.message.created event + post-send invalidation cover them.
  const { data: members, isLoading, isError } = useQuery({
    queryKey: queryKeys.channels.members(channelId),
    queryFn: () => channelsApi.members(channelId),
    enabled: !!channelId,
    refetchInterval: 15_000,
  });

  return (
    <aside className="w-64 shrink-0 border-l border-border flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t("membersLabel", "Members")}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive py-4 text-center" role="alert">
            {t("loadError", "Failed to load.")}
          </p>
        ) : !members || members.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic py-4 text-center">
            {t("noMembers", "No members")}
          </p>
        ) : (
          members.map((m) => <MemberCard key={m.agentId} member={m} />)
        )}
      </div>
    </aside>
  );
}

// ── page ───────────────────────────────────────────────────────────────────────

export function Channels() {
  const { t } = useTranslation("channels");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: t("breadcrumb", "Channels") }]);
  }, [setBreadcrumbs, t]);

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // Stable ref so the onmessage closure always reads the latest activeChannelId
  // without adding it to the WebSocket effect's dependency array (which would
  // tear down and recreate the socket on every channel switch).
  const activeChannelIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // ── Realtime WebSocket subscription ────────────────────────────────────────
  // Mirrors the connection/reconnect/cleanup pattern from useLiveRunTranscripts.
  // Guard against environments where WebSocket is not available (e.g. jsdom
  // without a WS mock) so the page never throws in test environments.
  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    if (!selectedCompanyId) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(selectedCompanyId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (message) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;

        let event: LiveEvent;
        try {
          event = JSON.parse(raw) as LiveEvent;
        } catch {
          return;
        }

        if (event.companyId !== selectedCompanyId) return;

        const payload = event.payload ?? {};

        if (event.type === "channel.message.created") {
          // Invalidate messages + members for the active channel only to avoid
          // needless refetches for channels the user is not currently viewing.
          const channelId = typeof payload["channelId"] === "string" ? payload["channelId"] : null;
          if (!channelId) return;
          if (channelId !== activeChannelIdRef.current) return;
          void queryClient.invalidateQueries({ queryKey: queryKeys.channels.messages(channelId) });
          // Intentional: an agent reply both adds a message AND can change the
          // member's status, so we refresh members too. Do not remove.
          void queryClient.invalidateQueries({ queryKey: queryKeys.channels.members(channelId) });
          return;
        }

        if (event.type === "channel.status.updated") {
          // Backend does not emit this event yet — handler wired for
          // forward-compatibility. Status freshness is currently guaranteed by
          // the refetchInterval on the members query in MembersPanel.
          const channelId = typeof payload["channelId"] === "string" ? payload["channelId"] : null;
          if (!channelId || channelId !== activeChannelIdRef.current) return;
          void queryClient.invalidateQueries({ queryKey: queryKeys.channels.members(channelId) });
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        // ORDER MATTERS: onclose must be nulled BEFORE we set the deferred-close
        // onopen below. Otherwise the close() we trigger on handshake completion
        // would fire onclose → scheduleReconnect → a phantom reconnect after
        // unmount. Do not reorder these lines.
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.CONNECTING) {
          // Defer the close until the handshake completes to avoid a noisy
          // "closed before the connection is established" browser warning.
          socket.onopen = () => {
            socket?.close(1000, "channels_unmount");
          };
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "channels_unmount");
        }
      }
    };
  // Re-create the socket only when the company or queryClient changes.
  // activeChannelId is tracked via activeChannelIdRef to avoid reconnecting
  // every time the user switches channels.
  }, [selectedCompanyId, queryClient]);

  const { data: channels, isLoading, isError } = useQuery({
    queryKey: queryKeys.channels.list(selectedCompanyId!),
    queryFn: () => channelsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Auto-select first channel once loaded
  useEffect(() => {
    if (channels && channels.length > 0 && !activeChannelId) {
      setActiveChannelId(channels[0].id);
    }
  }, [channels, activeChannelId]);

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={t("selectCompany", "Select a company to view channels.")}
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={t("loadError", "Failed to load.")}
      />
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={t("empty", "No channels yet. Channels appear once agents are assigned to departments.")}
      />
    );
  }

  const activeChannel = channels.find((ch) => ch.id === activeChannelId) ?? null;

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* page header */}
      <div className="shrink-0 mb-3">
        <h1 className="text-xl font-bold">{t("title", "Channels")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", "Team channels — send messages and @mention agents to trigger runs.")}
        </p>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 min-h-0 rounded-xl border border-border overflow-hidden bg-background">
        {/* left: channel list */}
        <ChannelRail
          channels={channels}
          activeId={activeChannelId}
          onSelect={setActiveChannelId}
        />

        {/* center: message stream */}
        {activeChannel ? (
          <MessageStream channelId={activeChannel.id} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground/60 italic">
            {t("selectChannel", "Select a channel to start chatting.")}
          </div>
        )}

        {/* right: member status */}
        {activeChannel ? (
          <MembersPanel channelId={activeChannel.id} />
        ) : null}
      </div>
    </div>
  );
}
