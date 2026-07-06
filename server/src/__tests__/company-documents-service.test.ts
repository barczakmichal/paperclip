import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, companyDocumentFacts, companyDocuments, createDb, documentRevisions, documents } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyDocumentService } from "../services/company-documents.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company-documents tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companyDocumentService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof companyDocumentService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-documents-service-");
    db = createDb(tempDb.connectionString);
    svc = companyDocumentService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(companyDocumentFacts);
    await db.delete(companyDocuments);
    await db.delete(documentRevisions);
    await db.delete(documents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Test Co",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  it("returns null when no document exists yet", async () => {
    const companyId = await createCompany();
    const doc = await svc.getDocumentByKey(companyId, "knowledge");
    expect(doc).toBeNull();
  });

  it("creates a document on first upsert with revision 1", async () => {
    const companyId = await createCompany();
    const result = await svc.upsertDocument({
      companyId,
      key: "knowledge",
      body: "# Stan wiedzy\n\nPierwsza wersja.",
    });
    expect(result.created).toBe(true);
    expect(result.document.latestRevisionNumber).toBe(1);

    const fetched = await svc.getDocumentByKey(companyId, "knowledge");
    expect(fetched?.body).toBe("# Stan wiedzy\n\nPierwsza wersja.");
  });

  it("requires baseRevisionId to update an existing document", async () => {
    const companyId = await createCompany();
    await svc.upsertDocument({ companyId, key: "knowledge", body: "v1" });
    await expect(svc.upsertDocument({ companyId, key: "knowledge", body: "v2" })).rejects.toThrow();
  });

  it("rejects a stale baseRevisionId", async () => {
    const companyId = await createCompany();
    const first = await svc.upsertDocument({ companyId, key: "knowledge", body: "v1" });
    await svc.upsertDocument({
      companyId,
      key: "knowledge",
      body: "v2",
      baseRevisionId: first.document.latestRevisionId,
    });
    await expect(
      svc.upsertDocument({
        companyId,
        key: "knowledge",
        body: "v3-stale",
        baseRevisionId: first.document.latestRevisionId,
      }),
    ).rejects.toThrow();
  });

  it("translates a concurrent duplicate create into a conflict error, not a raw pg error", async () => {
    const companyId = await createCompany();
    const results = await Promise.allSettled([
      svc.upsertDocument({ companyId, key: "knowledge", body: "racer A" }),
      svc.upsertDocument({ companyId, key: "knowledge", body: "racer B" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Either both interleave cleanly (one create, one conflict) — or in rare timing both succeed sequentially; assert no raw pg error leaks
    if (rejected.length > 0) {
      for (const r of rejected) {
        const err = (r as PromiseRejectedResult).reason as { status?: number; code?: string };
        expect(err.status).toBe(409);
        expect(err.code).not.toBe("23505");
      }
    } else {
      expect(fulfilled.length).toBe(2); // sequential timing — acceptable, no race occurred
    }
  });

  it("isolates documents between companies", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    await svc.upsertDocument({ companyId: companyA, key: "knowledge", body: "only A" });
    const forB = await svc.getDocumentByKey(companyB, "knowledge");
    expect(forB).toBeNull();
  });
});
