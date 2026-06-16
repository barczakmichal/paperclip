import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, channelMessages, channels, companies, createDb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { channelService } from "../services/channels.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres channel messages tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("channel messages", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof channelService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  let companyId!: string;
  let channelId!: string;
  let ceoId!: string;
  let cmoId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-channels-messages-");
    db = createDb(tempDb.connectionString);
    // Lekkie deps: prawdziwe serwisy heartbeat/issues nie są tu potrzebne (testujemy parsowanie i statusy),
    // ale @mention uruchamia mostek, więc create wstawia realny wiersz issues (FK channels.backingIssueId)
    // i zwraca jego id. heartbeat.wakeup to no-op.
    svc = channelService(db, {
      issues: {
        create: async (cId: string, data: any) => {
          const id = randomUUID();
          await db.insert(issues).values({
            id,
            companyId: cId,
            title: data.title ?? "channel",
            originKind: data.originKind ?? "channel",
            originId: data.originId ?? null,
            assigneeAgentId: data.assigneeAgentId ?? null,
          });
          return { id } as any;
        },
        addComment: async () => ({ id: randomUUID() } as any),
      },
      heartbeat: { wakeup: async () => null as any },
    });
  }, 20_000);

  afterEach(async () => {
    await db.delete(channelMessages);
    // channels.backingIssueId → issues.id (FK), więc channels przed issues
    await db.delete(channels);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndChannel() {
    companyId = randomUUID();
    ceoId = randomUUID();
    cmoId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Test Corp",
      issuePrefix: `TC${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values([
      {
        id: ceoId,
        companyId,
        name: "CEO",
        role: "ceo",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
        reportsTo: null,
      },
      {
        id: cmoId,
        companyId,
        name: "CMO",
        role: "cmo",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
        reportsTo: ceoId,
      },
    ]);

    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const company = list.find((c) => c.kind === "company")!;
    channelId = company.id;
  }

  it("zapisuje wiadomość użytkownika i zwraca ją w strumieniu", async () => {
    await seedCompanyAndChannel();
    const msg = await svc.postMessage(channelId, { body: "cześć zespół", userId: "u1" });
    const stream = await svc.listMessages(channelId, {});
    expect(stream.map((m) => m.id)).toContain(msg.id);
    expect(msg.mentionedAgentIds).toEqual([]);
  });

  it("parsuje @mention agenta do mentionedAgentIds", async () => {
    await seedCompanyAndChannel();
    const msg = await svc.postMessage(channelId, { body: "@CMO jak kampania?", userId: "u1" });
    expect(msg.mentionedAgentIds).toContain(cmoId);
  });

  it("listMessages z before zwraca tylko starsze wiadomości", async () => {
    await seedCompanyAndChannel();
    const first = await svc.postMessage(channelId, { body: "pierwsza", userId: "u1" });
    // Drobna przerwa — PostgreSQL timestamp ma rozdzielczość µs, tu wystarczy
    await new Promise((r) => setTimeout(r, 10));
    const second = await svc.postMessage(channelId, { body: "druga", userId: "u1" });

    const before = await svc.listMessages(channelId, { before: second.createdAt });
    const ids = before.map((m) => m.id);
    expect(ids).toContain(first.id);
    expect(ids).not.toContain(second.id);
  });

  it("memberStatuses: agent bez runów → online=idle, report=Bezczynny.", async () => {
    await seedCompanyAndChannel();
    const statuses = await svc.memberStatuses(channelId);
    expect(statuses.length).toBeGreaterThan(0);

    const cmoStatus = statuses.find((s) => s.agentId === cmoId);
    expect(cmoStatus).toBeDefined();
    expect(cmoStatus!.online).toBe("idle");
    expect(cmoStatus!.report).toBe("Bezczynny.");
    expect(cmoStatus!.now).toBeNull();
    expect(cmoStatus!.last).toBeNull();
  });

  it("memberStatuses: agent paused → online=paused", async () => {
    await seedCompanyAndChannel();
    const { eq } = await import("drizzle-orm");
    await db.update(agents).set({ status: "paused" }).where(eq(agents.id, cmoId));

    const statuses = await svc.memberStatuses(channelId);
    const cmoStatus = statuses.find((s) => s.agentId === cmoId);
    expect(cmoStatus).toBeDefined();
    expect(cmoStatus!.online).toBe("paused");
  });
});
