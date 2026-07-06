import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  companies,
  companyDocumentFacts,
  companyDocuments,
  createDb,
  documentRevisions,
  documents,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { companyRoutes } from "../routes/companies.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company-documents route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

type Db = ReturnType<typeof createDb>;

function boardActor(): Express.Request["actor"] {
  return { type: "board", userId: "local-board", source: "local_implicit" };
}

function agentActor(companyId: string, agentId: string): Express.Request["actor"] {
  return { type: "agent", agentId, companyId, source: "agent_jwt" };
}

function createApp(db: Db, actor: Express.Request["actor"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes(db));
  app.use(errorHandler);
  return app;
}

async function seedCompany(db: Db, label: string) {
  return db
    .insert(companies)
    .values({
      name: `Company Documents ${label}`,
      issuePrefix: `CD${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    })
    .returning()
    .then((rows) => rows[0]!);
}

describeEmbeddedPostgres("company document + fact routes", () => {
  let db!: Db;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-documents-routes-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(companyDocumentFacts);
    await db.delete(companyDocuments);
    await db.delete(documentRevisions);
    await db.delete(documents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("returns 404 for GET when the knowledge document does not exist yet", async () => {
    const company = await seedCompany(db, "Missing");
    const app = createApp(db, boardActor());

    const res = await request(app).get(`/api/companies/${company.id}/documents/knowledge`);

    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it("creates the document on first PUT (201, revision 1), then updates it (200) and rejects a stale baseRevisionId (409)", async () => {
    const company = await seedCompany(db, "Lifecycle");
    const app = createApp(db, boardActor());

    const created = await request(app)
      .put(`/api/companies/${company.id}/documents/knowledge`)
      .send({ body: "# Stan wiedzy\n\nPierwsza wersja." });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.latestRevisionNumber).toBe(1);
    expect(created.body.body).toBe("# Stan wiedzy\n\nPierwsza wersja.");

    const getAfterCreate = await request(app).get(`/api/companies/${company.id}/documents/knowledge`);
    expect(getAfterCreate.status).toBe(200);
    expect(getAfterCreate.body.latestRevisionId).toBe(created.body.latestRevisionId);

    const updated = await request(app)
      .put(`/api/companies/${company.id}/documents/knowledge`)
      .send({ body: "# Stan wiedzy\n\nDruga wersja.", baseRevisionId: created.body.latestRevisionId });

    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.latestRevisionNumber).toBe(2);
    expect(updated.body.body).toBe("# Stan wiedzy\n\nDruga wersja.");

    const staleUpdate = await request(app)
      .put(`/api/companies/${company.id}/documents/knowledge`)
      .send({ body: "# Stan wiedzy\n\nKonflikt.", baseRevisionId: created.body.latestRevisionId });

    expect(staleUpdate.status, JSON.stringify(staleUpdate.body)).toBe(409);
  });

  it("upserts a fact via PATCH (200 echoing the fact) and rejects an invalid factKey (400)", async () => {
    const company = await seedCompany(db, "Facts");
    const app = createApp(db, boardActor());

    const upserted = await request(app)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "backend-stack", value: "Next.js + Postgres" });

    expect(upserted.status, JSON.stringify(upserted.body)).toBe(200);
    expect(upserted.body).toEqual(
      expect.objectContaining({
        companyId: company.id,
        documentKey: "knowledge",
        factKey: "backend-stack",
        value: "Next.js + Postgres",
      }),
    );

    const invalid = await request(app)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "Bad Key!", value: "irrelevant" });

    expect(invalid.status, JSON.stringify(invalid.body)).toBe(400);
  });

  it("isolates documents between companies: a document created for company A is invisible under company B", async () => {
    const companyA = await seedCompany(db, "A");
    const companyB = await seedCompany(db, "B");
    const appA = createApp(db, boardActor());
    const appB = createApp(db, boardActor());

    const created = await request(appA)
      .put(`/api/companies/${companyA.id}/documents/knowledge`)
      .send({ body: "only A" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const crossCompanyGet = await request(appB).get(`/api/companies/${companyB.id}/documents/knowledge`);
    expect(crossCompanyGet.status).toBe(404);
  });

  it("denies an agent from a different company before the document lookup can matter", async () => {
    const companyA = await seedCompany(db, "AgentSource");
    const companyB = await seedCompany(db, "AgentTarget");
    const appAOwned = createApp(db, boardActor());
    await request(appAOwned)
      .put(`/api/companies/${companyA.id}/documents/knowledge`)
      .send({ body: "belongs to A" });

    const crossCompanyAgentApp = createApp(db, agentActor(companyB.id, randomUUID()));
    const res = await request(crossCompanyAgentApp).get(`/api/companies/${companyA.id}/documents/knowledge`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Agent key cannot access another company");
  });
});
