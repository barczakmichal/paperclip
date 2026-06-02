import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, channels, companies, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { channelService } from "../services/channels.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres channel service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("channelService.syncForCompany", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof channelService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  let companyId!: string;
  let ceoId!: string;
  let cmoId!: string;
  let contentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-channels-sync-");
    db = createDb(tempDb.connectionString);
    svc = channelService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(channels);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndAgents() {
    companyId = randomUUID();
    ceoId = randomUUID();
    cmoId = randomUUID();
    contentId = randomUUID();

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
        name: "CEO Agent",
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
        name: "CMO Agent",
        role: "cmo",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
        reportsTo: ceoId,
      },
      {
        id: contentId,
        companyId,
        name: "Content Agent",
        role: "general",
        status: "active",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
        reportsTo: cmoId,
      },
    ]);
  }

  it("tworzy kanał company dla CEO i department dla CMO", async () => {
    await seedCompanyAndAgents();
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const keys = list.map((c) => c.key).sort();
    expect(keys).toContain("ceo");
    expect(keys).toContain("marketing");
  });

  it("członkowie #marketing to CMO + poddrzewo (Content)", async () => {
    await seedCompanyAndAgents();
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const marketing = list.find((c) => c.key === "marketing")!;
    const members = await svc.membersOf(marketing.id);
    const ids = members.map((m) => m.id).sort();
    expect(ids).toEqual([cmoId, contentId].sort());
  });

  it("jest idempotentny (drugi sync nie duplikuje)", async () => {
    await seedCompanyAndAgents();
    await svc.syncForCompany(companyId);
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    expect(list.filter((c) => c.key === "marketing")).toHaveLength(1);
  });

  it("archiwizuje kanał gdy menedżer traci podwładnych", async () => {
    await seedCompanyAndAgents();
    await svc.syncForCompany(companyId);
    // przenieś Content pod CEO — CMO traci podwładnych
    await db.update(agents).set({ reportsTo: ceoId }).where(eq(agents.id, contentId));
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId); // zwraca tylko aktywne
    expect(list.find((c) => c.key === "marketing")).toBeUndefined();
  });

  // C1 — cykl w reportsTo nie wiesza membersOf
  it("membersOf zwraca skończony zbiór przy cyklu reportsTo", async () => {
    companyId = randomUUID();
    const aId = randomUUID();
    const bId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Cycle Corp",
      issuePrefix: `CY${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values([
      { id: aId, companyId, name: "Agent A", role: "engineer", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: bId },
      { id: bId, companyId, name: "Agent B", role: "engineer", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: aId },
    ]);
    // kanał department z managerAgentId=A, omijając sync (sync nie tworzy kanalow w cyklu bez roota)
    const channelId = randomUUID();
    await db.insert(channels).values({ id: channelId, companyId, key: "tech", name: "Tech", kind: "department", managerAgentId: aId });
    const members = await svc.membersOf(channelId);
    const ids = members.map((m) => m.id).sort();
    expect(ids).toEqual([aId, bId].sort());
  });

  // C2 — kolizja kluczy ról daje dwa osobne kanały, idempotentnie
  it("dwóch menedżerów engineer → dwa osobne kanały department, idempotentnie", async () => {
    companyId = randomUUID();
    ceoId = randomUUID();
    const eng1 = randomUUID();
    const eng2 = randomUUID();
    const rep1 = randomUUID();
    const rep2 = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Two Eng Corp",
      issuePrefix: `TE${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values([
      { id: ceoId, companyId, name: "CEO Agent", role: "ceo", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: null },
      { id: eng1, companyId, name: "Engineer One", role: "engineer", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: ceoId },
      { id: eng2, companyId, name: "Engineer Two", role: "engineer", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: ceoId },
      { id: rep1, companyId, name: "Report One", role: "general", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: eng1 },
      { id: rep2, companyId, name: "Report Two", role: "general", status: "active", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {}, reportsTo: eng2 },
    ]);
    await svc.syncForCompany(companyId);
    const first = await svc.list(companyId);
    const deptFirst = first.filter((c) => c.kind === "department");
    expect(deptFirst).toHaveLength(2);
    expect(new Set(deptFirst.map((c) => c.key)).size).toBe(2);
    expect(new Set(deptFirst.map((c) => c.managerAgentId))).toEqual(new Set([eng1, eng2]));

    // drugi sync — bez duplikatów i bez archiwizacji
    await svc.syncForCompany(companyId);
    const second = await svc.list(companyId);
    expect(second.filter((c) => c.kind === "department")).toHaveLength(2);
    expect(second.map((c) => c.key).sort()).toEqual(first.map((c) => c.key).sort());
  });

  // I2 — terminated podwładny nie jest członkiem
  it("terminated podwładny NIE jest w membersOf", async () => {
    await seedCompanyAndAgents();
    await db.update(agents).set({ status: "terminated" }).where(eq(agents.id, contentId));
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const marketing = list.find((c) => c.key === "marketing");
    // CMO straciła jedynego (terminated) podwładnego → brak kanału department
    expect(marketing).toBeUndefined();
    const company = list.find((c) => c.kind === "company")!;
    const members = await svc.membersOf(company.id);
    expect(members.map((m) => m.id)).not.toContain(contentId);
  });
});
