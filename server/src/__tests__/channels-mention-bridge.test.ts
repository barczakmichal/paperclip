import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    `Skipping embedded Postgres channels mention bridge tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("channel @mention → run bridge", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  let companyId!: string;
  let channelId!: string;
  let cmoId!: string;
  let seededIssueId!: string;
  let runId!: string;
  let commentId!: string;

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
    // Mocki zwracają PRAWDZIWE UUID-y, więc produkcyjna ścieżka persystencji
    // (channels.backingIssueId, channel_messages.triggeredRunId/backingIssueCommentId) jest realnie testowana.
    runId = randomUUID();
    commentId = randomUUID();
    wakeup = vi.fn().mockResolvedValue({ id: runId });
    issuesMock = {
      // seededIssueId ustawiany w seedCompanyAndChannel po wstawieniu realnego wiersza issues
      create: vi.fn(),
      addComment: vi.fn().mockResolvedValue({ id: commentId }),
    };
    svc = channelService(db, { heartbeat: { wakeup }, issues: issuesMock });
  });

  afterEach(async () => {
    await db.delete(channelMessages);
    // channels.backingIssueId → issues.id (FK), więc czyścimy channels przed issues
    await db.delete(channels);
    await db.delete(issues);
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

    await svc.syncForCompany(companyId);
    const list = await svc.list(companyId);
    const company = list.find((c) => c.kind === "company")!;
    channelId = company.id;

    // Realny wiersz issues — FK channels.backingIssueId → issues.id będzie spełniony przy persyście.
    seededIssueId = randomUUID();
    await db.insert(issues).values({
      id: seededIssueId,
      companyId,
      title: `#${company.key}`,
      originKind: "channel",
      originId: channelId,
      assigneeAgentId: cmoId,
    });
    issuesMock.create.mockResolvedValue({ id: seededIssueId });
  }

  it("mention tworzy backing-issue, mirroruje komentarz i budzi agenta", async () => {
    await seedCompanyAndChannel();

    const message = await svc.postMessage(channelId, { body: "@CMO status?", userId: "u1" });

    expect(issuesMock.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({ originKind: "channel", originId: channelId }),
    );
    expect(issuesMock.addComment).toHaveBeenCalledWith(
      seededIssueId,
      "@CMO status?",
      { userId: "u1" },
    );
    expect(wakeup).toHaveBeenCalledWith(
      cmoId,
      expect.objectContaining({
        reason: "channel_mention",
        payload: expect.objectContaining({ channelId, issueId: seededIssueId }),
      }),
    );

    // Ścieżka DB: channels.backingIssueId został zapisany.
    const channelRow = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .then((rows) => rows[0]);
    expect(channelRow?.backingIssueId).toBe(seededIssueId);

    // Ścieżka DB: wiersz channel_messages ma triggeredRunId/backingIssueCommentId.
    const persistedMessage = await db
      .select()
      .from(channelMessages)
      .where(eq(channelMessages.id, message.id))
      .then((rows) => rows[0]);
    expect(persistedMessage?.triggeredRunId).toBe(runId);
    expect(persistedMessage?.backingIssueCommentId).toBe(commentId);
  });

  it("druga wiadomość reużywa istniejący backing-issue (przez DB, nie cache)", async () => {
    await seedCompanyAndChannel();

    await svc.postMessage(channelId, { body: "@CMO raz", userId: "u1" });

    // Świeża instancja serwisu z nowym create — reużycie musi działać przez odczyt channels.backingIssueId z DB.
    const secondCreate = vi.fn().mockResolvedValue({ id: randomUUID() });
    const secondSvc = channelService(db, {
      heartbeat: { wakeup: vi.fn().mockResolvedValue({ id: randomUUID() }) },
      issues: { create: secondCreate, addComment: vi.fn().mockResolvedValue({ id: randomUUID() }) },
    });

    await secondSvc.postMessage(channelId, { body: "@CMO dwa", userId: "u1" });

    // create NIE wywołane na drugiej instancji — backingIssueId odczytany z DB.
    expect(secondCreate).not.toHaveBeenCalled();

    const channelRow = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .then((rows) => rows[0]);
    expect(channelRow?.backingIssueId).toBe(seededIssueId);
  });

  it("wiadomość bez mentiona nie budzi nikogo", async () => {
    await seedCompanyAndChannel();

    await svc.postMessage(channelId, { body: "notatka", userId: "u1" });

    expect(wakeup).not.toHaveBeenCalled();
    expect(issuesMock.create).not.toHaveBeenCalled();
  });
});
