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
});
