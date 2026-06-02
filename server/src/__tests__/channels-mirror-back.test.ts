import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  agents,
  channelMessages,
  channels,
  companies,
  createDb,
  issueComments,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { channelService } from "../services/channels.js";
import { issueService } from "../services/issues.js";
import { mirrorAgentCommentToChannel } from "../services/channel-mirror.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres channels mirror-back tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("mirror zwrotny agenta → kanał", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  let companyId!: string;
  let channelId!: string;
  let cmoId!: string;
  let backingIssueId!: string;
  let manualIssueId!: string;
  let existingCommentId!: string;

  let issueSvc!: ReturnType<typeof issueService>;
  let channelSvc!: ReturnType<typeof channelService>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-channels-mirror-back-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  beforeEach(async () => {
    issueSvc = issueService(db);
    channelSvc = channelService(db);

    companyId = randomUUID();
    const ceoId = randomUUID();
    cmoId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Test Corp Mirror",
      issuePrefix: `TM${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
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

    // Synchronizujemy kanały dla firmy
    await channelSvc.syncForCompany(companyId);
    const channelList = await channelSvc.list(companyId);
    const companyChannel = channelList.find((c) => c.kind === "company")!;
    channelId = companyChannel.id;

    // Backing issue: originKind="channel", originId=channelId
    backingIssueId = randomUUID();
    await db.insert(issues).values({
      id: backingIssueId,
      companyId,
      title: "#channel-backing",
      originKind: "channel",
      originId: channelId,
      assigneeAgentId: cmoId,
    });

    // Zwykłe issue bez powiązania z kanałem
    manualIssueId = randomUUID();
    await db.insert(issues).values({
      id: manualIssueId,
      companyId,
      title: "zwykłe zadanie",
      originKind: "manual",
      originId: null,
    });

    // Istniejący komentarz agenta na backing issue (dla testu deduplicacji)
    const [existingComment] = await db
      .insert(issueComments)
      .values({
        companyId,
        issueId: backingIssueId,
        authorAgentId: cmoId,
        body: "istniejący komentarz agenta",
      })
      .returning();
    existingCommentId = existingComment.id;
  });

  afterEach(async () => {
    await db.delete(channelMessages);
    await db.delete(issueComments);
    // channels.backingIssueId → issues.id (FK), więc channels przed issues
    await db.delete(channels);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  it("komentarz agenta w backing-issue pojawia się w kanale jako agent_reply", async () => {
    await issueSvc.addComment(backingIssueId, "gotowe, ROAS 3.1", { agentId: cmoId });
    const stream = await channelSvc.listMessages(channelId, {});
    const reply = stream.find((m) => m.kind === "agent_reply");
    expect(reply?.body).toBe("gotowe, ROAS 3.1");
    expect(reply?.authorAgentId).toBe(cmoId);
  });

  it("nie duplikuje przy ponownym mirrorze tego samego komentarza", async () => {
    await mirrorAgentCommentToChannel(db, { commentId: existingCommentId });
    await mirrorAgentCommentToChannel(db, { commentId: existingCommentId });
    const rows = await db
      .select()
      .from(channelMessages)
      .where(eq(channelMessages.backingIssueCommentId, existingCommentId));
    expect(rows).toHaveLength(1);
  });

  it("komentarz na zwykłym issue (origin=manual) nie trafia do kanałów", async () => {
    await issueSvc.addComment(manualIssueId, "zwykły komentarz", { agentId: cmoId });
    const stream = await channelSvc.listMessages(channelId, {});
    expect(stream.some((m) => m.body === "zwykły komentarz")).toBe(false);
  });

  it("komentarz użytkownika na backing-issue nie jest mirrorowany", async () => {
    await issueSvc.addComment(backingIssueId, "komentarz usera", { userId: "user123" });
    const stream = await channelSvc.listMessages(channelId, {});
    expect(stream.some((m) => m.body === "komentarz usera")).toBe(false);
  });
});
