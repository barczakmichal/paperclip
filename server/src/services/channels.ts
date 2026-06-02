import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, channels } from "@paperclipai/db";
import { channelKeyForRole, CHANNEL_ROLE_KEY_MAP, type AgentRole } from "@paperclipai/shared";

export function channelService(db: Db) {
  async function loadAgents(companyId: string) {
    return db.select().from(agents).where(eq(agents.companyId, companyId));
  }

  function subtreeIds(rootId: string, byParent: Map<string | null, { id: string }[]>): string[] {
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      for (const child of byParent.get(id) ?? []) stack.push(child.id);
    }
    return out;
  }

  async function syncForCompany(companyId: string) {
    const all = await loadAgents(companyId);
    const byParent = new Map<string | null, { id: string }[]>();
    for (const a of all) {
      const arr = byParent.get(a.reportsTo) ?? [];
      arr.push({ id: a.id });
      byParent.set(a.reportsTo, arr);
    }
    const roots = all.filter((a) => !a.reportsTo || !all.some((x) => x.id === a.reportsTo));

    const desired = new Map<string, { name: string; kind: "company" | "department"; managerAgentId: string | null }>();
    const ceo = roots.find((a) => a.role === "ceo") ?? roots[0];
    if (ceo) desired.set("ceo", { name: "CEO", kind: "company", managerAgentId: ceo.id });
    for (const a of all) {
      const hasReports = (byParent.get(a.id) ?? []).length > 0;
      if (!hasReports || a.id === ceo?.id) continue;
      const key = channelKeyForRole(a.role as AgentRole);
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

  async function membersOf(channelId: string) {
    const ch = await db.select().from(channels).where(eq(channels.id, channelId)).then((r) => r[0] ?? null);
    if (!ch) return [];
    const all = await loadAgents(ch.companyId);
    if (ch.kind === "company") return all;
    const byParent = new Map<string | null, { id: string }[]>();
    for (const a of all) {
      const arr = byParent.get(a.reportsTo) ?? [];
      arr.push({ id: a.id });
      byParent.set(a.reportsTo, arr);
    }
    const ids = new Set(ch.managerAgentId ? subtreeIds(ch.managerAgentId, byParent) : []);
    return all.filter((a) => ids.has(a.id));
  }

  return { syncForCompany, list, membersOf };
}
