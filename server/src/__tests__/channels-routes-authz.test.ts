import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChannelSvc = vi.hoisted(() => ({
  syncForCompany: vi.fn(),
  list: vi.fn(),
  membersOf: vi.fn(),
  memberStatuses: vi.fn(),
  listMessages: vi.fn(),
  postMessage: vi.fn(),
  getChannel: vi.fn(),
}));

const mockHeartbeatSvc = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));

vi.mock("../services/channels.js", () => ({
  channelService: () => mockChannelSvc,
}));

vi.mock("../services/heartbeat.js", () => ({
  heartbeatService: () => mockHeartbeatSvc,
}));

function registerChannelRouteMocks() {
  vi.doMock("../services/channels.js", () => ({
    channelService: () => mockChannelSvc,
  }));

  vi.doMock("../services/heartbeat.js", () => ({
    heartbeatService: () => mockHeartbeatSvc,
  }));
}

let appImportCounter = 0;

async function createChannelApp(actor: Record<string, unknown>) {
  registerChannelRouteMocks();
  appImportCounter += 1;
  const routeModulePath = `../routes/channels.js?channels-routes-authz-${appImportCounter}`;
  const middlewareModulePath = `../middleware/index.js?channels-routes-authz-${appImportCounter}`;
  const [{ channelRoutes }, { errorHandler }] = await Promise.all([
    import(routeModulePath) as Promise<typeof import("../routes/channels.js")>,
    import(middlewareModulePath) as Promise<typeof import("../middleware/index.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", channelRoutes({} as any, { pluginWorkerManager: undefined as any }));
  app.use(errorHandler);
  return app;
}

function buildChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-1",
    companyId: "company-1",
    key: "ceo",
    name: "CEO",
    kind: "company",
    managerAgentId: null,
    backingIssueId: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe.sequential("channels route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelSvc.syncForCompany.mockResolvedValue(undefined);
    mockChannelSvc.list.mockResolvedValue([buildChannel()]);
    mockChannelSvc.getChannel.mockResolvedValue(buildChannel());
    mockChannelSvc.memberStatuses.mockResolvedValue([]);
    mockChannelSvc.listMessages.mockResolvedValue([]);
    mockChannelSvc.postMessage.mockResolvedValue({
      id: "msg-1",
      channelId: "channel-1",
      companyId: "company-1",
      body: "hello",
      authorUserId: "user-1",
      authorAgentId: null,
      kind: "message",
      mentionedAgentIds: [],
      triggeredRunId: null,
      backingIssueCommentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("odrzuca agenta z innej firmy przy POST wiadomości", async () => {
    mockChannelSvc.getChannel.mockResolvedValue(buildChannel({ companyId: "company-1" }));
    const app = await createChannelApp({
      type: "agent",
      agentId: "a1",
      companyId: "other",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/channels/channel-1/messages")
      .send({ body: "hello" });

    expect(res.status).toBe(403);
    expect(mockChannelSvc.postMessage).not.toHaveBeenCalled();
  });

  it("pozwala uprawnionemu użytkownikowi wysłać wiadomość (201)", async () => {
    mockChannelSvc.getChannel.mockResolvedValue(buildChannel({ companyId: "company-1" }));
    const app = await createChannelApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      memberships: [{ companyId: "company-1", status: "active", membershipRole: "member" }],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .post("/api/channels/channel-1/messages")
      .send({ body: "hello" });

    expect(res.status).toBe(201);
    expect(mockChannelSvc.postMessage).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({ body: "hello", userId: "user-1" }),
    );
  });

  it("waliduje pustą treść (400)", async () => {
    mockChannelSvc.getChannel.mockResolvedValue(buildChannel({ companyId: "company-1" }));
    const app = await createChannelApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      memberships: [{ companyId: "company-1", status: "active", membershipRole: "member" }],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .post("/api/channels/channel-1/messages")
      .send({ body: "" });

    expect(res.status).toBe(400);
    expect(mockChannelSvc.postMessage).not.toHaveBeenCalled();
  });

  it("zwraca 404 dla nieznanego kanału przy GET messages", async () => {
    mockChannelSvc.getChannel.mockResolvedValue(null);
    const app = await createChannelApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/channels/no-such-channel/messages");

    expect(res.status).toBe(404);
  });

  it("GET /companies/:companyId/channels wymaga dostępu do firmy", async () => {
    const app = await createChannelApp({
      type: "agent",
      agentId: "a1",
      companyId: "other",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app).get("/api/companies/company-1/channels");

    expect(res.status).toBe(403);
    expect(mockChannelSvc.list).not.toHaveBeenCalled();
  });
});
