import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, channelMessages, channels, heartbeatRuns } from "@paperclipai/db";
import {
  channelKeyForRole,
  CHANNEL_ROLE_KEY_MAP,
  type AgentOnlineStatus,
  type AgentRole,
  type ChannelMemberStatus,
} from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { composeAgentStatusReport } from "./agent-status.js";
import { issueService, normalizeAgentMentionToken } from "./issues.js";
import { heartbeatService } from "./heartbeat.js";
import { HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS } from "./heartbeat-run-summary.js";

type ChannelRow = typeof channels.$inferSelect;

type IssuesDep = Pick<ReturnType<typeof issueService>, "create" | "addComment">;
type HeartbeatDep = { wakeup: ReturnType<typeof heartbeatService>["wakeup"] };

interface ChannelServiceDeps {
  issues?: IssuesDep;
  heartbeat?: HeartbeatDep;
}

const EXCLUDED_AGENT_STATUSES = ["terminated", "pending_approval"];

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function channelService(db: Db, deps?: ChannelServiceDeps) {
  const issues: IssuesDep = deps?.issues ?? issueService(db);
  // UWAGA: domyślny heartbeatService(db) BEZ pluginWorkerManager NIE dispatchuje runów do workerów.
  // Produkcyjny caller (route w Task 8) MUSI wstrzyknąć heartbeat: heartbeatService(db, { pluginWorkerManager }),
  // inaczej wakeup zapisze żądanie, ale run nie zostanie podjęty przez workera.
  const heartbeat: HeartbeatDep = deps?.heartbeat ?? heartbeatService(db);
  async function loadAgents(companyId: string) {
    return db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.companyId, companyId),
          notInArray(agents.status, EXCLUDED_AGENT_STATUSES),
        ),
      );
  }

  function buildByParent(all: { id: string; reportsTo: string | null }[]) {
    const byParent = new Map<string | null, { id: string }[]>();
    for (const a of all) {
      const arr = byParent.get(a.reportsTo) ?? [];
      arr.push({ id: a.id });
      byParent.set(a.reportsTo, arr);
    }
    return byParent;
  }

  function subtreeIds(rootId: string, byParent: Map<string | null, { id: string }[]>): string[] {
    const out: string[] = [];
    const visited = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      out.push(id);
      for (const child of byParent.get(id) ?? []) stack.push(child.id);
    }
    return out;
  }

  async function syncForCompany(companyId: string) {
    const all = await loadAgents(companyId);
    const byParent = buildByParent(all);
    const roots = all.filter((a) => !a.reportsTo || !all.some((x) => x.id === a.reportsTo));

    const desired = new Map<string, { name: string; kind: "company" | "department"; managerAgentId: string | null }>();
    const ceo = roots.find((a) => a.role === "ceo") ?? roots[0];
    if (ceo) {
      const rootKey = channelKeyForRole(ceo.role as AgentRole);
      const rootName = CHANNEL_ROLE_KEY_MAP[ceo.role as AgentRole]?.name ?? "CEO";
      desired.set(rootKey, { name: rootName, kind: "company", managerAgentId: ceo.id });
    }

    // Sort po id dla deterministycznego przydzialu sufiksow przy kolizji kluczy rol.
    const sortedAgents = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const a of sortedAgents) {
      const hasReports = (byParent.get(a.id) ?? []).length > 0;
      if (!hasReports || a.id === ceo?.id) continue;
      const baseKey = channelKeyForRole(a.role as AgentRole);
      let key = baseKey;
      if (desired.has(key)) {
        key = `${baseKey}-${slug(a.name) || a.id.slice(0, 8)}`;
      }
      const name = CHANNEL_ROLE_KEY_MAP[a.role as AgentRole]?.name ?? a.name;
      desired.set(key, { name, kind: "department", managerAgentId: a.id });
    }

    const existing = await db.select().from(channels).where(eq(channels.companyId, companyId));
    const existingByKey = new Map(existing.map((c) => [c.key, c]));

    for (const [key, d] of desired) {
      const found = existingByKey.get(key);
      if (!found) {
        await db.insert(channels).values({ companyId, key, name: d.name, kind: d.kind, managerAgentId: d.managerAgentId });
      } else if (found.archivedAt || found.managerAgentId !== d.managerAgentId || found.name !== d.name) {
        await db.update(channels).set({ archivedAt: null, managerAgentId: d.managerAgentId, name: d.name, updatedAt: new Date() }).where(eq(channels.id, found.id));
      }
    }
    for (const c of existing) {
      if (!desired.has(c.key) && !c.archivedAt) {
        await db.update(channels).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(channels.id, c.id));
      }
    }
  }

  async function list(companyId: string) {
    return db.select().from(channels).where(and(eq(channels.companyId, companyId), isNull(channels.archivedAt)));
  }

  async function loadChannel(channelId: string): Promise<ChannelRow | null> {
    return db.select().from(channels).where(eq(channels.id, channelId)).then((r) => r[0] ?? null);
  }

  // Wyznacza członków na podstawie już załadowanego rekordu kanału (bez ponownego zapytania).
  async function membersOfChannel(ch: ChannelRow) {
    const all = await loadAgents(ch.companyId);
    if (ch.kind === "company") return all;
    const byParent = buildByParent(all);
    const ids = new Set(ch.managerAgentId ? subtreeIds(ch.managerAgentId, byParent) : []);
    return all.filter((a) => ids.has(a.id));
  }

  async function membersOf(channelId: string) {
    const ch = await loadChannel(channelId);
    if (!ch) return [];
    return membersOfChannel(ch);
  }

  // Parsuje tokeny @wzmianka z body i resolwuje je do agentId po name (case-insensitive).
  // Dopasowanie: pojedyncze słowo po @, np. @CMO — ograniczenie udokumentowane.
  function parseMentions(body: string, members: { id: string; name: string }[]): string[] {
    const re = /\B@([^\s@,!?.]+)/g;
    const tokens = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const normalized = normalizeAgentMentionToken(m[1]);
      if (normalized) tokens.add(normalized.toLowerCase());
    }
    if (tokens.size === 0) return [];
    const resolved = new Set<string>();
    for (const agent of members) {
      if (tokens.has(agent.name.toLowerCase())) {
        resolved.add(agent.id);
      }
    }
    return [...resolved];
  }

  // Lazily tworzy backing issue dla kanału jeśli jeszcze nie istnieje.
  // Reużycie realizowane wyłącznie przez odczyt/persystencję channels.backingIssueId (bez cache in-memory).
  async function ensureBackingIssue(ch: ChannelRow, firstMentionAgentId: string): Promise<string> {
    // Odczytaj świeży rekord z DB — może być już ustawiony przez wcześniejsze wywołanie
    const fresh = await loadChannel(ch.id);
    if (fresh?.backingIssueId) return fresh.backingIssueId;

    const created = await issues.create(ch.companyId, {
      title: `#${ch.key}`,
      originKind: "channel",
      originId: ch.id,
      assigneeAgentId: firstMentionAgentId,
    });

    // Warunkowy persyst: ustaw backingIssueId tylko jeśli wciąż null (tani guard na wyścig).
    const persisted = await db
      .update(channels)
      .set({ backingIssueId: created.id, updatedAt: new Date() })
      .where(and(eq(channels.id, ch.id), isNull(channels.backingIssueId)))
      .returning({ id: channels.id });

    if (persisted.length === 0) {
      // Inny zapis wygrał wyścig — odczytaj zwycięski backingIssueId i porzuć właśnie utworzone issue.
      const reread = await loadChannel(ch.id);
      if (reread?.backingIssueId) return reread.backingIssueId;
      // Kanał zniknął między warunkowym UPDATE a re-readem — nie zwracaj cicho sieroty.
      throw notFound(`Channel zniknal podczas ensureBackingIssue: ${ch.id}`);
    }

    return created.id;
  }

  async function postMessage(
    channelId: string,
    input: { body: string; userId?: string; agentId?: string; kind?: string },
  ) {
    const ch = await loadChannel(channelId);
    if (!ch) throw notFound(`Channel not found: ${channelId}`);

    const members = await membersOfChannel(ch);
    const mentionedAgentIds = parseMentions(input.body, members);

    const [inserted] = await db
      .insert(channelMessages)
      .values({
        companyId: ch.companyId,
        channelId,
        authorUserId: input.userId ?? null,
        authorAgentId: input.agentId ?? null,
        kind: input.kind ?? "message",
        body: input.body,
        mentionedAgentIds,
      })
      .returning();

    // Most @mention → run: tylko gdy są wzmianki
    if (mentionedAgentIds.length > 0) {
      const issueId = await ensureBackingIssue(ch, mentionedAgentIds[0]);

      const comment = await issues.addComment(issueId, input.body, { userId: input.userId });
      const backingIssueCommentId = comment.id;

      let triggeredRunId: string | null = null;

      // Budzimy tylko pierwszego wspomnianego agenta (najprostsze podejście — YAGNI).
      // wakeup jest opakowane: błąd budzenia nie blokuje zapisu wiadomości ani komentarza.
      try {
        const wakeResult = await heartbeat.wakeup(mentionedAgentIds[0], {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "channel_mention",
          payload: { channelId, messageId: inserted.id, issueId },
          requestedByActorType: "user",
          requestedByActorId: input.userId ?? null,
          contextSnapshot: { channelId, issueId },
        });
        // Defensywnie: kształt zwrotki wakeup może się różnić — czytamy .id jeśli jest.
        triggeredRunId = wakeResult?.id ?? null;
      } catch {
        // Nie blokujemy zapisu wiadomości błędem wakeup.
      }

      // Aktualizuj wiersz wiadomości o powiązane id (id-ki to prawdziwe UUID z serwisów).
      if (triggeredRunId !== null || backingIssueCommentId !== null) {
        await db
          .update(channelMessages)
          .set({
            ...(triggeredRunId !== null ? { triggeredRunId } : {}),
            ...(backingIssueCommentId !== null ? { backingIssueCommentId } : {}),
          })
          .where(eq(channelMessages.id, inserted.id));
      }

      return {
        ...inserted,
        triggeredRunId: triggeredRunId ?? inserted.triggeredRunId,
        backingIssueCommentId: backingIssueCommentId ?? inserted.backingIssueCommentId,
      };
    }

    return inserted;
  }

  async function listMessages(channelId: string, opts: { before?: Date | string; limit?: number }) {
    const limit = opts.limit ?? 50;
    const conditions = [eq(channelMessages.channelId, channelId)];
    if (opts.before) {
      const beforeDate = opts.before instanceof Date ? opts.before : new Date(opts.before);
      conditions.push(lt(channelMessages.createdAt, beforeDate));
    }
    return db
      .select()
      .from(channelMessages)
      .where(and(...conditions))
      .orderBy(desc(channelMessages.createdAt))
      .limit(limit);
  }

  // Mapowanie statusu agenta na AgentOnlineStatus:
  //   - "paused"  → "paused"  (agent jawnie wstrzymany)
  //   - "error"   → "error"   (agent w stanie błędu)
  //   - ma aktywny run (status="running") → "active"
  //   - pozostałe → "idle"
  async function memberStatuses(channelId: string): Promise<ChannelMemberStatus[]> {
    const members = await membersOf(channelId);
    const agentIds = members.map((a) => a.id);
    if (agentIds.length === 0) return [];

    // Batch: aktywne runy (status="running") dla wszystkich członków jednym zapytaniem.
    // orderBy desc(startedAt) → przy grupowaniu pierwszy wpis per agent = najnowszy.
    const activeRows = await db
      .select({
        agentId: heartbeatRuns.agentId,
        nextAction: heartbeatRuns.nextAction,
        currentThought: heartbeatRuns.currentThought,
      })
      .from(heartbeatRuns)
      .where(and(inArray(heartbeatRuns.agentId, agentIds), eq(heartbeatRuns.status, "running")))
      .orderBy(desc(heartbeatRuns.startedAt));

    const activeByAgent = new Map<string, (typeof activeRows)[number]>();
    for (const row of activeRows) {
      if (!activeByAgent.has(row.agentId)) activeByAgent.set(row.agentId, row);
    }

    // Batch: ostatni zakończony run (succeeded) per agent jednym zapytaniem.
    // orderBy desc(finishedAt) → pierwszy per agent = najświeższy. Truncacja jak w heartbeat.ts.
    const lastRows = await db
      .select({
        agentId: heartbeatRuns.agentId,
        resultSummary: sql<
          string | null
        >`left(${heartbeatRuns.resultJson} ->> 'summary', ${HEARTBEAT_RUN_RESULT_SUMMARY_MAX_CHARS})`.as("resultSummary"),
      })
      .from(heartbeatRuns)
      .where(and(inArray(heartbeatRuns.agentId, agentIds), eq(heartbeatRuns.status, "succeeded")))
      .orderBy(desc(heartbeatRuns.finishedAt));

    const lastByAgent = new Map<string, (typeof lastRows)[number]>();
    for (const row of lastRows) {
      if (!lastByAgent.has(row.agentId)) lastByAgent.set(row.agentId, row);
    }

    return members.map((agent) => {
      const activeRun = activeByAgent.get(agent.id);
      const lastRun = lastByAgent.get(agent.id);

      let online: AgentOnlineStatus;
      if (agent.status === "paused") online = "paused";
      else if (agent.status === "error") online = "error";
      else if (agent.status === "running" || activeRun) online = "active";
      else online = "idle";

      const nowText = activeRun?.nextAction ?? activeRun?.currentThought ?? null;
      const lastText = lastRun?.resultSummary ?? null;

      const report = composeAgentStatusReport({ now: nowText, last: lastText, online });

      return {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        icon: null,
        online,
        now: nowText,
        last: lastText,
        report,
      } satisfies ChannelMemberStatus;
    });
  }

  // Publiczny wrapper nad prywatnym loadChannel: route'y /channels/:id/* potrzebują
  // companyId kanału, by wykonać assertCompanyAccess (companyId nie ma w URL).
  // loadChannel pozostaje prywatne (szczegół implementacyjny serwisu używany wewnętrznie
  // przez postMessage/membersOf); getChannel to wąski, czytelny kontrakt dla warstwy REST.
  async function getChannel(channelId: string) {
    return loadChannel(channelId);
  }

  return { syncForCompany, list, membersOf, postMessage, listMessages, memberStatuses, getChannel };
}
