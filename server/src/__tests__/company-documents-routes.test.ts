import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  companyDocumentFacts,
  companyDocuments,
  createDb,
  documentRevisions,
  documents,
} from "@paperclipai/db";
import { LOW_TRUST_REVIEW_PRESET } from "@paperclipai/shared";
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

async function seedAgent(db: Db, companyId: string, label: string, permissions: Record<string, unknown> = {}) {
  return db
    .insert(agents)
    .values({
      companyId,
      name: `Agent ${label}`,
      role: "engineer",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions,
    })
    .returning()
    .then((rows) => rows[0]!);
}

function seedLowTrustAgent(db: Db, companyId: string) {
  return seedAgent(db, companyId, "LowTrust", {
    trustPreset: LOW_TRUST_REVIEW_PRESET,
    authorizationPolicy: {
      trustBoundary: {
        mode: LOW_TRUST_REVIEW_PRESET,
        companyId,
        rootIssueId: randomUUID(),
      },
    },
  });
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
    await db.delete(agents);
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

  it("denies a low-trust agent from writing the knowledge document or a fact (403), while a normal agent still succeeds", async () => {
    const company = await seedCompany(db, "LowTrustWrites");
    const lowTrustAgent = await seedLowTrustAgent(db, company.id);
    const normalAgent = await seedAgent(db, company.id, "Normal");

    const lowTrustApp = createApp(db, agentActor(company.id, lowTrustAgent.id));
    const normalApp = createApp(db, agentActor(company.id, normalAgent.id));

    const deniedPut = await request(lowTrustApp)
      .put(`/api/companies/${company.id}/documents/knowledge`)
      .send({ body: "low-trust attempt" });
    expect(deniedPut.status, JSON.stringify(deniedPut.body)).toBe(403);
    expect(deniedPut.body.error).toBe("Low-trust actors cannot use this control-plane surface");

    const deniedPatch = await request(lowTrustApp)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "backend-stack", value: "should not persist" });
    expect(deniedPatch.status, JSON.stringify(deniedPatch.body)).toBe(403);
    expect(deniedPatch.body.error).toBe("Low-trust actors cannot use this control-plane surface");

    const noDocument = await request(normalApp).get(`/api/companies/${company.id}/documents/knowledge`);
    expect(noDocument.status).toBe(404);

    const allowedPut = await request(normalApp)
      .put(`/api/companies/${company.id}/documents/knowledge`)
      .send({ body: "normal agent write" });
    expect(allowedPut.status, JSON.stringify(allowedPut.body)).toBe(201);

    const allowedPatch = await request(normalApp)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "backend-stack", value: "Next.js + Postgres" });
    expect(allowedPatch.status, JSON.stringify(allowedPatch.body)).toBe(200);

    // The low-trust agent's GET access remains open (read is not gated by this guard).
    const lowTrustGet = await request(lowTrustApp).get(`/api/companies/${company.id}/documents/knowledge`);
    expect(lowTrustGet.status, JSON.stringify(lowTrustGet.body)).toBe(200);
  });

  it("deletes a fact (200 with the deleted fact), then 404s on repeat delete", async () => {
    const company = await seedCompany(db, "FactDelete");
    const app = createApp(db, boardActor());

    await request(app)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "backend-stack", value: "Next.js + Postgres" });

    const deleted = await request(app).delete(`/api/companies/${company.id}/documents/knowledge/facts/backend-stack`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({
        companyId: company.id,
        documentKey: "knowledge",
        factKey: "backend-stack",
        value: "Next.js + Postgres",
      }),
    );

    const repeat = await request(app).delete(`/api/companies/${company.id}/documents/knowledge/facts/backend-stack`);
    expect(repeat.status, JSON.stringify(repeat.body)).toBe(404);
  });

  it("denies a low-trust agent from deleting a fact (403)", async () => {
    const company = await seedCompany(db, "FactDeleteLowTrust");
    const boardApp = createApp(db, boardActor());
    await request(boardApp)
      .patch(`/api/companies/${company.id}/documents/knowledge/facts`)
      .send({ factKey: "backend-stack", value: "Next.js + Postgres" });

    const lowTrustAgent = await seedLowTrustAgent(db, company.id);
    const lowTrustApp = createApp(db, agentActor(company.id, lowTrustAgent.id));

    const res = await request(lowTrustApp).delete(`/api/companies/${company.id}/documents/knowledge/facts/backend-stack`);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toBe("Low-trust actors cannot use this control-plane surface");
  });
});
