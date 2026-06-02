import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, channelMessages, channels, companies, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { channelService } from "../services/channels.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres channels mention bridge tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("channel @mention → run bridge", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  let companyId!: string;
  let channelId!: string;
  let cmoId!: string;

  let wakeup: ReturnType<typeof vi.fn>;
  let issuesMock: { create: ReturnType<typeof vi.fn>; addComment: ReturnType<typeof vi.fn> };
  let svc!: ReturnType<typeof channelService>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-channels-mention-bridge-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  beforeEach(() => {
    wakeup = vi.fn().mockResolvedValue({ id: "run-1" });
    issuesMock = {
      create: vi.fn().mockResolvedValue({ id: "iss-1" }),
      addComment: vi.fn().mockResolvedValue({ id: "cmt-1" }),
    };
    svc = channelService(db, { heartbeat: { wakeup }, issues: issuesMock });
  });

  afterEach(async () => {
    await db.delete(channelMessages);
    await db.delete(channels);
    await db.delete(agents);
    await db.delete(companies);
    vi.clearAllMocks();
  });

  async function seedCompanyAndChannel() {
    companyId = randomUUID();
    const ceoId = randomUUID();
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

    // Musimy przebudować svc po seedzie żeby mieć świeże mocki i poprawny companyId
    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const company = list.find((c) => c.kind === "company")!;
    channelId = company.id;
  }

  it("mention tworzy backing-issue, mirroruje komentarz i budzi agenta", async () => {
    await seedCompanyAndChannel();

    await svc.postMessage(channelId, { body: "@CMO status?", userId: "u1" });

    expect(issuesMock.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({ originKind: "channel", originId: channelId }),
    );
    expect(issuesMock.addComment).toHaveBeenCalledWith(
      "iss-1",
      "@CMO status?",
      { userId: "u1" },
    );
    expect(wakeup).toHaveBeenCalledWith(
      cmoId,
      expect.objectContaining({
        reason: "channel_mention",
        payload: expect.objectContaining({ channelId, issueId: "iss-1" }),
      }),
    );
  });

  it("druga wiadomość reużywa istniejący backing-issue", async () => {
    await seedCompanyAndChannel();

    await svc.postMessage(channelId, { body: "@CMO raz", userId: "u1" });
    await svc.postMessage(channelId, { body: "@CMO dwa", userId: "u1" });

    expect(issuesMock.create).toHaveBeenCalledTimes(1);
  });

  it("wiadomość bez mentiona nie budzi nikogo", async () => {
    await seedCompanyAndChannel();

    await svc.postMessage(channelId, { body: "notatka", userId: "u1" });

    expect(wakeup).not.toHaveBeenCalled();
  });
});
