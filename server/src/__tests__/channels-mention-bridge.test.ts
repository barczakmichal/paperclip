import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agents, channelMessages, channels, companies, createDb, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { channelService, extractTriggeredRunId } from "../services/channels.js";
import { issueService } from "../services/issues.js";

describe("extractTriggeredRunId — kształty zwrotki heartbeat.wakeup", () => {
  it("czyta id z rekordu runu (queued/coalesced)", () => {
    expect(extractTriggeredRunId({ id: "run-abc", status: "queued" })).toBe("run-abc");
  });

  it("czyta executionRunId ze zwrotki skipped (dedup/agent zajęty)", () => {
    expect(
      extractTriggeredRunId({ status: "skipped", reason: "agent_busy", executionRunId: "run-exec" }),
    ).toBe("run-exec");
  });

  it("czyta triggeredRunId oraz zagnieżdżone run.id", () => {
    expect(extractTriggeredRunId({ triggeredRunId: "run-trig" })).toBe("run-trig");
    expect(extractTriggeredRunId({ run: { id: "run-nested" } })).toBe("run-nested");
  });

  it("zwraca null gdy runu nie ma (null/undefined/pusty obiekt/skipped bez runu)", () => {
    expect(extractTriggeredRunId(null)).toBeNull();
    expect(extractTriggeredRunId(undefined)).toBeNull();
    expect(extractTriggeredRunId({})).toBeNull();
    expect(extractTriggeredRunId({ status: "skipped", executionRunId: null })).toBeNull();
  });
});

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
      expect.objectContaining({ originKind: "channel", originId: channelId, hiddenAt: expect.any(Date) }),
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
        // Kontekst interaction-wake — pozwala obudzić agenta != assignee backing-issue
        // (guard issue_assignee_changed w heartbeat). Naśladuje @mention w komentarzu issue.
        contextSnapshot: expect.objectContaining({
          channelId,
          issueId: seededIssueId,
          wakeReason: "issue_comment_mentioned",
          source: "comment.mention",
          commentId,
        }),
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

  it("zapisuje triggeredRunId gdy wakeup zwraca kształt skipped z executionRunId", async () => {
    await seedCompanyAndChannel();

    // Symulujemy realny wariant zwrotki: agent zajęty/dedup → status="skipped",
    // ale run i tak istnieje i jego id siedzi pod executionRunId (nie pod .id).
    const execRunId = randomUUID();
    wakeup.mockResolvedValueOnce({
      status: "skipped",
      reason: "agent_busy",
      message: null,
      issueId: seededIssueId,
      executionRunId: execRunId,
      executionAgentId: cmoId,
      executionAgentName: "CMO",
    });

    const message = await svc.postMessage(channelId, { body: "@CMO status?", userId: "u1" });

    const persistedMessage = await db
      .select()
      .from(channelMessages)
      .where(eq(channelMessages.id, message.id))
      .then((rows) => rows[0]);
    expect(persistedMessage?.triggeredRunId).toBe(execRunId);
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

  it("backing issue z hiddenAt nie pojawia się w issueService.list", async () => {
    await seedCompanyAndChannel();

    // Bezpośrednio tworzymy backing issue z hiddenAt przez prawdziwy issueService —
    // to weryfikuje że hiddenAt jest realnie filtrowane przez list(), niezależnie od mocked deps.
    // Używamy unikalnego originId aby nie kolidować z seededIssueId wstawionym w seedCompanyAndChannel.
    const realIssueService = issueService(db);
    const hiddenOriginId = randomUUID();
    await realIssueService.create(companyId, {
      title: "#hidden-channel",
      originKind: "channel",
      originId: hiddenOriginId,
      hiddenAt: new Date(),
    });

    const listed = await realIssueService.list(companyId);
    const hiddenInList = listed.find((issue) => issue.originKind === "channel" && issue.originId === hiddenOriginId);
    expect(hiddenInList).toBeUndefined();
  });
});
