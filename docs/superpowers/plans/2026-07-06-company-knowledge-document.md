# Company Knowledge Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Paperclip company a persistent, per-company "knowledge document" (manual narrative + agent-updated facts) that is automatically injected into every agent's heartbeat-context, so agents stop rediscovering the same company/architecture facts from scratch on every run.

**Architecture:** Reuse the existing company-scoped `documents`/`document_revisions` engine (already used by `issue_documents`) via two new tables: `company_documents` (company+key → document, mirrors `issue_documents` minus `issueId`) and `company_document_facts` (company+documentKey+factKey → value, race-safe upsert per fact). New service `companyDocumentService`, three new routes on the existing `companies.ts` router, and one wiring point inside the existing `GET /issues/:id/heartbeat-context` route.

**Tech Stack:** TypeScript, Express, Drizzle ORM (PostgreSQL), Zod (`@paperclipai/shared`), Vitest + embedded-postgres test helper (`server/src/__tests__/helpers/embedded-postgres.ts`).

**Design spec:** `docs/superpowers/specs/2026-07-06-company-knowledge-document-design.md`

**Decided during planning (spec's open points):**
1. Size/staleness warning thresholds: **4000 characters**, **30 days**.
2. Facts rendered as a markdown bullet list under a `## Fakty` heading, sorted alphabetically by `factKey`.
3. `PATCH .../facts` is open to any authenticated agent/board member of the company (same permission bar as writing the manual document) — no extra CEO-only restriction, consistent with how issue documents don't restrict writes by role either.

---

### Task 1: DB schema — `company_documents` + `company_document_facts` tables

**Files:**
- Create: `packages/db/src/schema/company_documents.ts`
- Create: `packages/db/src/schema/company_document_facts.ts`
- Modify: `packages/db/src/schema/index.ts:60` (right after the `issueDocuments` export)

- [ ] **Step 1: Write `company_documents.ts`**

```ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { documents } from "./documents.js";

export const companyDocuments = pgTable(
  "company_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyUq: uniqueIndex("company_documents_company_key_uq").on(table.companyId, table.key),
    documentUq: uniqueIndex("company_documents_document_uq").on(table.documentId),
    companyUpdatedIdx: index("company_documents_company_updated_idx").on(table.companyId, table.updatedAt),
  }),
);
```

- [ ] **Step 2: Write `company_document_facts.ts`**

```ts
import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const companyDocumentFacts = pgTable(
  "company_document_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    documentKey: text("document_key").notNull(),
    factKey: text("fact_key").notNull(),
    value: text("value").notNull(),
    updatedByAgentId: uuid("updated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyDocumentFactUq: uniqueIndex("company_document_facts_company_key_fact_uq").on(
      table.companyId,
      table.documentKey,
      table.factKey,
    ),
  }),
);
```

Note: `company_document_facts` has no FK to `company_documents` — facts can exist before any manual document body does (lazy creation, per spec §5).

- [ ] **Step 3: Export both tables from the schema barrel**

In `packages/db/src/schema/index.ts`, right after line 60 (`export { issueDocuments } from "./issue_documents.js";`), add:

```ts
export { companyDocuments } from "./company_documents.js";
export { companyDocumentFacts } from "./company_document_facts.js";
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @paperclipai/db generate`
Expected: a new file `packages/db/src/migrations/0104_<auto-name>.sql` containing `CREATE TABLE "company_documents" ...` and `CREATE TABLE "company_document_facts" ...`, plus an updated `packages/db/src/migrations/meta/_journal.json` with a new entry `idx: 104`.

- [ ] **Step 5: Typecheck the db package**

Run: `pnpm --filter @paperclipai/db build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/company_documents.ts packages/db/src/schema/company_document_facts.ts packages/db/src/schema/index.ts packages/db/src/migrations
git commit -m "feat(db): add company_documents and company_document_facts tables"
```

---

### Task 2: Service layer — get/put company document

**Files:**
- Create: `server/src/services/company-documents.ts`
- Test: `server/src/__tests__/company-documents-service.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
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

  it("isolates documents between companies", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    await svc.upsertDocument({ companyId: companyA, key: "knowledge", body: "only A" });
    const forB = await svc.getDocumentByKey(companyB, "knowledge");
    expect(forB).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/company-documents-service.test.ts`
Expected: FAIL — `Cannot find module '../services/company-documents.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the minimal service implementation**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyDocumentFacts, companyDocuments, documentRevisions, documents } from "@paperclipai/db";
import { issueDocumentKeySchema } from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";

export const KNOWLEDGE_DOCUMENT_KEY = "knowledge";
const SIZE_WARNING_THRESHOLD_CHARS = 4000;
const STALENESS_WARNING_DAYS = 30;

function normalizeDocumentKey(key: string) {
  const normalized = key.trim().toLowerCase();
  const parsed = issueDocumentKeySchema.safeParse(normalized);
  if (!parsed.success) {
    throw unprocessable("Invalid document key", parsed.error.issues);
  }
  return parsed.data;
}

const companyDocumentSelect = {
  id: documents.id,
  companyId: documents.companyId,
  key: companyDocuments.key,
  title: documents.title,
  format: documents.format,
  latestBody: documents.latestBody,
  latestRevisionId: documents.latestRevisionId,
  latestRevisionNumber: documents.latestRevisionNumber,
  createdByAgentId: documents.createdByAgentId,
  createdByUserId: documents.createdByUserId,
  updatedByAgentId: documents.updatedByAgentId,
  updatedByUserId: documents.updatedByUserId,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

export function companyDocumentService(db: Db) {
  return {
    getDocumentByKey: async (companyId: string, rawKey: string) => {
      const key = normalizeDocumentKey(rawKey);
      const row = await db
        .select(companyDocumentSelect)
        .from(companyDocuments)
        .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
        .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.key, key)))
        .then((rows) => rows[0] ?? null);
      return row ? { ...row, body: row.latestBody } : null;
    },

    upsertDocument: async (input: {
      companyId: string;
      key: string;
      title?: string | null;
      body: string;
      changeSummary?: string | null;
      baseRevisionId?: string | null;
      createdByAgentId?: string | null;
      createdByUserId?: string | null;
      createdByRunId?: string | null;
    }) => {
      const key = normalizeDocumentKey(input.key);
      return db.transaction(async (tx) => {
        const now = new Date();
        const existing = await tx
          .select(companyDocumentSelect)
          .from(companyDocuments)
          .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
          .where(and(eq(companyDocuments.companyId, input.companyId), eq(companyDocuments.key, key)))
          .then((rows) => rows[0] ?? null);

        if (existing) {
          if (!input.baseRevisionId) {
            throw conflict("Document update requires baseRevisionId", {
              currentRevisionId: existing.latestRevisionId,
            });
          }
          if (input.baseRevisionId !== existing.latestRevisionId) {
            throw conflict("Document was updated by someone else", {
              currentRevisionId: existing.latestRevisionId,
            });
          }

          const nextRevisionNumber = existing.latestRevisionNumber + 1;
          const [revision] = await tx
            .insert(documentRevisions)
            .values({
              companyId: input.companyId,
              documentId: existing.id,
              revisionNumber: nextRevisionNumber,
              title: input.title ?? null,
              format: "markdown",
              body: input.body,
              changeSummary: input.changeSummary ?? null,
              createdByAgentId: input.createdByAgentId ?? null,
              createdByUserId: input.createdByUserId ?? null,
              createdByRunId: input.createdByRunId ?? null,
              createdAt: now,
            })
            .returning();

          await tx
            .update(documents)
            .set({
              title: input.title ?? null,
              latestBody: input.body,
              latestRevisionId: revision.id,
              latestRevisionNumber: nextRevisionNumber,
              updatedByAgentId: input.createdByAgentId ?? null,
              updatedByUserId: input.createdByUserId ?? null,
              updatedAt: now,
            })
            .where(eq(documents.id, existing.id));

          await tx
            .update(companyDocuments)
            .set({ updatedAt: now })
            .where(eq(companyDocuments.documentId, existing.id));

          return {
            created: false as const,
            document: {
              ...existing,
              title: input.title ?? null,
              body: input.body,
              latestRevisionId: revision.id,
              latestRevisionNumber: nextRevisionNumber,
              updatedAt: now,
            },
          };
        }

        if (input.baseRevisionId) {
          throw conflict("Document does not exist yet", { key });
        }

        const [document] = await tx
          .insert(documents)
          .values({
            companyId: input.companyId,
            title: input.title ?? null,
            format: "markdown",
            latestBody: input.body,
            latestRevisionId: null,
            latestRevisionNumber: 1,
            createdByAgentId: input.createdByAgentId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            updatedByAgentId: input.createdByAgentId ?? null,
            updatedByUserId: input.createdByUserId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const [revision] = await tx
          .insert(documentRevisions)
          .values({
            companyId: input.companyId,
            documentId: document.id,
            revisionNumber: 1,
            title: input.title ?? null,
            format: "markdown",
            body: input.body,
            changeSummary: input.changeSummary ?? null,
            createdByAgentId: input.createdByAgentId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            createdByRunId: input.createdByRunId ?? null,
            createdAt: now,
          })
          .returning();

        await tx.update(documents).set({ latestRevisionId: revision.id }).where(eq(documents.id, document.id));

        await tx.insert(companyDocuments).values({
          companyId: input.companyId,
          documentId: document.id,
          key,
          createdAt: now,
          updatedAt: now,
        });

        return {
          created: true as const,
          document: {
            id: document.id,
            companyId: input.companyId,
            key,
            title: document.title,
            format: document.format,
            body: document.latestBody,
            latestRevisionId: revision.id,
            latestRevisionNumber: 1,
            createdByAgentId: document.createdByAgentId,
            createdByUserId: document.createdByUserId,
            updatedByAgentId: document.updatedByAgentId,
            updatedByUserId: document.updatedByUserId,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          },
        };
      });
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/company-documents-service.test.ts`
Expected: PASS (5 tests) — if embedded Postgres isn't supported on this host, the suite reports `skipped` instead, which is also acceptable (matches existing `documents-service.test.ts` behavior).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/company-documents.ts server/src/__tests__/company-documents-service.test.ts
git commit -m "feat(server): add companyDocumentService get/put"
```

---

### Task 3: Service layer — facts + `renderDocument`

**Files:**
- Modify: `server/src/services/company-documents.ts`
- Modify: `server/src/__tests__/company-documents-service.test.ts`

- [ ] **Step 1: Add failing tests for `upsertFact`, `listFacts`, and `renderDocument`**

Append to `server/src/__tests__/company-documents-service.test.ts` (inside the same `describeEmbeddedPostgres` block, after the existing `it(...)` blocks):

```ts
  it("upserts a fact and overwrites the same factKey", async () => {
    const companyId = await createCompany();
    await svc.upsertFact({ companyId, documentKey: "knowledge", factKey: "backend-stack", value: "Vercel (wrong)" });
    await svc.upsertFact({ companyId, documentKey: "knowledge", factKey: "backend-stack", value: "Next.js + Postgres + Prisma on VPS" });

    const facts = await svc.listFacts(companyId, "knowledge");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.value).toBe("Next.js + Postgres + Prisma on VPS");
  });

  it("renders null when no document and no facts exist", async () => {
    const companyId = await createCompany();
    const rendered = await svc.renderDocument(companyId, "knowledge");
    expect(rendered).toBeNull();
  });

  it("renders manual body plus facts section", async () => {
    const companyId = await createCompany();
    await svc.upsertDocument({ companyId, key: "knowledge", body: "## Kontekst\n\nSklep wedkarski." });
    await svc.upsertFact({ companyId, documentKey: "knowledge", factKey: "backend-stack", value: "Next.js + Postgres" });
    await svc.upsertFact({ companyId, documentKey: "knowledge", factKey: "deploy-target", value: "VPS Hostinger, NIE Vercel" });

    const rendered = await svc.renderDocument(companyId, "knowledge");
    expect(rendered?.body).toContain("## Kontekst");
    expect(rendered?.body).toContain("## Fakty");
    expect(rendered?.body).toContain("- **backend-stack**: Next.js + Postgres");
    expect(rendered?.body).toContain("- **deploy-target**: VPS Hostinger, NIE Vercel");
    expect(rendered?.warnings).toEqual([]);
  });

  it("warns when the rendered document is larger than the size threshold", async () => {
    const companyId = await createCompany();
    await svc.upsertDocument({ companyId, key: "knowledge", body: "x".repeat(4001) });

    const rendered = await svc.renderDocument(companyId, "knowledge");
    expect(rendered?.warnings.some((w) => w.includes("duży"))).toBe(true);
  });

  it("warns when the document has not been updated in over 30 days", async () => {
    const companyId = await createCompany();
    await svc.upsertDocument({ companyId, key: "knowledge", body: "stara wersja" });
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await db
      .update(documents)
      .set({ updatedAt: thirtyOneDaysAgo })
      .where(eq(documents.companyId, companyId));

    const rendered = await svc.renderDocument(companyId, "knowledge");
    expect(rendered?.warnings.some((w) => w.includes("nie był aktualizowany"))).toBe(true);
  });
```

Add `eq` to the existing `drizzle-orm` import at the top of the test file (it currently has no such import — add `import { eq } from "drizzle-orm";`).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd server && npx vitest run src/__tests__/company-documents-service.test.ts`
Expected: FAIL — `svc.upsertFact is not a function` (and similarly for `listFacts`/`renderDocument`).

- [ ] **Step 3: Implement `upsertFact`, `listFacts`, `renderDocument`**

Add these three functions to the returned object in `companyDocumentService` in `server/src/services/company-documents.ts` (alongside `getDocumentByKey`/`upsertDocument`):

```ts
    upsertFact: async (input: {
      companyId: string;
      documentKey: string;
      factKey: string;
      value: string;
      updatedByAgentId?: string | null;
      updatedByUserId?: string | null;
    }) => {
      const documentKey = normalizeDocumentKey(input.documentKey);
      const factKey = normalizeDocumentKey(input.factKey);
      const now = new Date();
      const [row] = await db
        .insert(companyDocumentFacts)
        .values({
          companyId: input.companyId,
          documentKey,
          factKey,
          value: input.value,
          updatedByAgentId: input.updatedByAgentId ?? null,
          updatedByUserId: input.updatedByUserId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [companyDocumentFacts.companyId, companyDocumentFacts.documentKey, companyDocumentFacts.factKey],
          set: {
            value: input.value,
            updatedByAgentId: input.updatedByAgentId ?? null,
            updatedByUserId: input.updatedByUserId ?? null,
            updatedAt: now,
          },
        })
        .returning();
      return row;
    },

    listFacts: async (companyId: string, rawDocumentKey: string) => {
      const documentKey = normalizeDocumentKey(rawDocumentKey);
      return db
        .select()
        .from(companyDocumentFacts)
        .where(and(eq(companyDocumentFacts.companyId, companyId), eq(companyDocumentFacts.documentKey, documentKey)))
        .orderBy(companyDocumentFacts.factKey);
    },

    renderDocument: async (companyId: string, rawKey: string) => {
      const key = normalizeDocumentKey(rawKey);
      const [doc, facts] = await Promise.all([
        db
          .select(companyDocumentSelect)
          .from(companyDocuments)
          .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
          .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.key, key)))
          .then((rows) => rows[0] ?? null),
        db
          .select()
          .from(companyDocumentFacts)
          .where(and(eq(companyDocumentFacts.companyId, companyId), eq(companyDocumentFacts.documentKey, key)))
          .orderBy(companyDocumentFacts.factKey),
      ]);

      if (!doc && facts.length === 0) {
        return null;
      }

      const manualBody = doc?.latestBody?.trim() ?? "";
      const factsSection = facts.length
        ? `## Fakty\n${facts.map((f) => `- **${f.factKey}**: ${f.value}`).join("\n")}`
        : "";
      const body = [manualBody, factsSection].filter((part) => part.length > 0).join("\n\n");

      const warnings: string[] = [];
      if (body.length > SIZE_WARNING_THRESHOLD_CHARS) {
        warnings.push(`⚠️ Dokument wiedzy jest duży (${body.length} znaków) — rozważ przycięcie.`);
      }
      if (doc) {
        const ageDays = Math.floor((Date.now() - doc.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays > STALENESS_WARNING_DAYS) {
          warnings.push(`⚠️ Dokument wiedzy nie był aktualizowany od ${ageDays} dni.`);
        }
      }

      return { key, body, charCount: body.length, updatedAt: doc?.updatedAt ?? null, warnings };
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/company-documents-service.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/company-documents.ts server/src/__tests__/company-documents-service.test.ts
git commit -m "feat(server): add fact upsert and rendered-document warnings to companyDocumentService"
```

---

### Task 4: Validators

**Files:**
- Modify: `packages/shared/src/validators/company.ts`
- Modify: `packages/shared/src/validators/index.ts:28` (right after the closing `} from "./company.js";`)
- Modify: `packages/shared/src/index.ts:914` (right after `updateCompanyBrandingSchema,`)

- [ ] **Step 1: Add schemas to `company.ts`**

Add to the top imports of `packages/shared/src/validators/company.ts`:

```ts
import { multilineTextSchema } from "./text.js";
import { issueDocumentKeySchema } from "./issue.js";
```

Append at the end of the file:

```ts
export const upsertCompanyDocumentSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  body: multilineTextSchema.pipe(z.string().max(524288)),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
});
export type UpsertCompanyDocument = z.infer<typeof upsertCompanyDocumentSchema>;

export const upsertCompanyDocumentFactSchema = z.object({
  factKey: issueDocumentKeySchema,
  value: z.string().trim().min(1).max(2000),
});
export type UpsertCompanyDocumentFact = z.infer<typeof upsertCompanyDocumentFactSchema>;
```

- [ ] **Step 2: Export from `validators/index.ts`**

In the `export { ... } from "./company.js";` block (ending at line 28), add two names to the list:

```ts
  upsertCompanyDocumentSchema,
  upsertCompanyDocumentFactSchema,
```

- [ ] **Step 3: Export from the package's top-level `index.ts`**

Right after `updateCompanyBrandingSchema,` at line 914 in `packages/shared/src/index.ts`, add:

```ts
  upsertCompanyDocumentSchema,
  upsertCompanyDocumentFactSchema,
```

- [ ] **Step 4: Typecheck the shared package**

Run: `pnpm --filter @paperclipai/shared typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/validators/company.ts packages/shared/src/validators/index.ts packages/shared/src/index.ts
git commit -m "feat(shared): add company document/fact validators"
```

---

### Task 5: Routes — GET/PUT document, PATCH fact

**Files:**
- Modify: `server/src/routes/companies.ts`
- Test: `server/src/__tests__/company-documents-routes.test.ts`

- [ ] **Step 1: Wire the service into `companies.ts`**

In `server/src/routes/companies.ts`, add `companyDocumentService` to the import from `../services/index.js` (line 21-30 block) and `upsertCompanyDocumentSchema`, `upsertCompanyDocumentFactSchema`, `issueDocumentKeySchema` to the `@paperclipai/shared` import (line 6-18 block). Then, inside `export function companyRoutes(db: Db, storage?: StorageService) {` right after `const router = Router();` (line 36), add:

```ts
  const companyDocumentsSvc = companyDocumentService(db);
```

Also add `export { companyDocumentService } from "./company-documents.js";` to `server/src/services/index.ts` (next to the existing `documentService` export line).

- [ ] **Step 2: Add the three routes**

Insert right after the existing `router.get("/:companyId/artifacts", ...)` block (ends at line 136) in `server/src/routes/companies.ts`:

```ts
  router.get("/:companyId/documents/:key", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const keyParsed = issueDocumentKeySchema.safeParse(String(req.params.key ?? "").trim().toLowerCase());
    if (!keyParsed.success) {
      res.status(400).json({ error: "Invalid document key", details: keyParsed.error.issues });
      return;
    }
    const doc = await companyDocumentsSvc.getDocumentByKey(companyId, keyParsed.data);
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(doc);
  });

  router.put("/:companyId/documents/:key", validate(upsertCompanyDocumentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const keyParsed = issueDocumentKeySchema.safeParse(String(req.params.key ?? "").trim().toLowerCase());
    if (!keyParsed.success) {
      res.status(400).json({ error: "Invalid document key", details: keyParsed.error.issues });
      return;
    }
    const actor = getActorInfo(req);
    const result = await companyDocumentsSvc.upsertDocument({
      companyId,
      key: keyParsed.data,
      title: req.body.title ?? null,
      body: req.body.body,
      changeSummary: req.body.changeSummary ?? null,
      baseRevisionId: req.body.baseRevisionId ?? null,
      createdByAgentId: actor.agentId ?? null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      createdByRunId: actor.runId ?? null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: result.created ? "company.document_created" : "company.document_updated",
      entityType: "company",
      entityId: companyId,
      details: {
        key: result.document.key,
        documentId: result.document.id,
        revisionNumber: result.document.latestRevisionNumber,
      },
    });
    res.status(result.created ? 201 : 200).json(result.document);
  });

  router.patch("/:companyId/documents/:key/facts", validate(upsertCompanyDocumentFactSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const keyParsed = issueDocumentKeySchema.safeParse(String(req.params.key ?? "").trim().toLowerCase());
    if (!keyParsed.success) {
      res.status(400).json({ error: "Invalid document key", details: keyParsed.error.issues });
      return;
    }
    const actor = getActorInfo(req);
    const fact = await companyDocumentsSvc.upsertFact({
      companyId,
      documentKey: keyParsed.data,
      factKey: req.body.factKey,
      value: req.body.value,
      updatedByAgentId: actor.agentId ?? null,
      updatedByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.document_fact_upserted",
      entityType: "company",
      entityId: companyId,
      details: { documentKey: keyParsed.data, factKey: fact.factKey },
    });
    res.status(200).json(fact);
  });
```

- [ ] **Step 3: Write the failing route test**

Follow the existing pattern in `server/src/__tests__/company-artifacts-service.test.ts` or any `*-routes.test.ts` file for spinning up `app.ts` against embedded Postgres with a local-trusted agent/board token. Create `server/src/__tests__/company-documents-routes.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, companyDocumentFacts, companyDocuments, createDb, documentRevisions, documents } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { createTestApp, createLocalTrustedBoardHeaders } from "./helpers/test-app.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("company documents routes", () => {
  let db!: ReturnType<typeof createDb>;
  let app!: ReturnType<typeof createTestApp>["app"];
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-documents-routes-");
    db = createDb(tempDb.connectionString);
    ({ app } = createTestApp(db));
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

  it("returns 404 for a missing document", async () => {
    const companyId = await createCompany();
    const res = await app
      .request(`/api/companies/${companyId}/documents/knowledge`)
      .set(createLocalTrustedBoardHeaders());
    expect(res.status).toBe(404);
  });

  it("creates then updates a document via PUT, rejecting a stale baseRevisionId", async () => {
    const companyId = await createCompany();
    const created = await app
      .request(`/api/companies/${companyId}/documents/knowledge`)
      .set(createLocalTrustedBoardHeaders())
      .send({ body: "v1" });
    expect(created.status).toBe(201);

    const updated = await app
      .request(`/api/companies/${companyId}/documents/knowledge`)
      .set(createLocalTrustedBoardHeaders())
      .send({ body: "v2", baseRevisionId: created.body.latestRevisionId });
    expect(updated.status).toBe(200);

    const stale = await app
      .request(`/api/companies/${companyId}/documents/knowledge`)
      .set(createLocalTrustedBoardHeaders())
      .send({ body: "v3", baseRevisionId: created.body.latestRevisionId });
    expect(stale.status).toBe(409);
  });

  it("upserts a fact via PATCH", async () => {
    const companyId = await createCompany();
    const res = await app
      .request(`/api/companies/${companyId}/documents/knowledge/facts`)
      .set(createLocalTrustedBoardHeaders())
      .send({ factKey: "backend-stack", value: "Next.js + Postgres" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe("Next.js + Postgres");
  });
});
```

**Before running this test**, check `server/src/__tests__/helpers/test-app.ts` (or the closest equivalent — inspect an existing simple routes test such as `server/src/__tests__/company-artifacts-service.test.ts` or `server/src/__tests__/issue-references-service.test.ts` for the actual app/request helper name and a `.set(...)` auth header helper for a local-trusted board actor) and adjust the two helper import names in the test above to match what actually exists — this repo's exact helper name for "app + local-trusted board request" was not confirmed while writing this plan.

- [ ] **Step 4: Run the test to verify it fails, then implement/adjust until it passes**

Run: `cd server && npx vitest run src/__tests__/company-documents-routes.test.ts`
Iterate on the helper import from Step 3 and the route code from Step 2 until all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/companies.ts server/src/services/index.ts server/src/__tests__/company-documents-routes.test.ts
git commit -m "feat(server): expose company document + fact HTTP routes"
```

---

### Task 6: Wire into `heartbeat-context`

**Files:**
- Modify: `server/src/routes/issues.ts` (around line 1042 for service instantiation, lines 2741-2866 for the heartbeat-context route)
- Test: `server/src/__tests__/issues-goal-context-routes.test.ts` (heartbeat-context already has coverage in this file — add a case here) or a new focused test file if that file doesn't fit; check the file first and follow its existing setup pattern.

- [ ] **Step 1: Instantiate the service**

Add `companyDocumentService` to the existing import list from `../services/index.js` at the top of `server/src/routes/issues.ts` (next to `documentService` at line 85), and `KNOWLEDGE_DOCUMENT_KEY` import from `../services/company-documents.js`. Then near line 1042 (`const documentsSvc = documentService(db);`), add:

```ts
  const companyDocumentsSvc = companyDocumentService(db);
```

- [ ] **Step 2: Write a failing test for the new field**

In `server/src/__tests__/issues-goal-context-routes.test.ts`, find the existing `heartbeat-context` test setup (search for `heartbeat-context` in that file) and add a new `it(...)` alongside it:

```ts
  it("includes companyKnowledge in heartbeat-context when a document exists", async () => {
    // Reuse this file's existing company/issue fixtures and auth header helper.
    await companyDocumentsSvcUnderTest.upsertDocument({
      companyId,
      key: "knowledge",
      body: "## Kontekst\n\nSklep testowy.",
    });

    const res = await app
      .request(`/api/issues/${issueId}/heartbeat-context`)
      .set(authHeadersForThisFile);

    expect(res.status).toBe(200);
    expect(res.body.companyKnowledge?.body).toContain("Sklep testowy");
    expect(res.body.companyKnowledge?.warnings).toEqual([]);
  });

  it("returns companyKnowledge: null when no document exists", async () => {
    const res = await app
      .request(`/api/issues/${issueId}/heartbeat-context`)
      .set(authHeadersForThisFile);

    expect(res.status).toBe(200);
    expect(res.body.companyKnowledge).toBeNull();
  });
```

Adjust `companyDocumentsSvcUnderTest`, `companyId`, `issueId`, `app`, and `authHeadersForThisFile` to whatever names the existing tests in this file actually use — read the file's existing `beforeAll`/fixture setup first and reuse those exact identifiers instead of inventing new ones.

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx vitest run src/__tests__/issues-goal-context-routes.test.ts`
Expected: FAIL — `companyKnowledge` is `undefined`, not present in the response.

- [ ] **Step 4: Wire the field into the route**

In the `Promise.all([...])` array starting at line 2741 in `server/src/routes/issues.ts`, add one more entry at the end (after `recoveryActionsSvc.getActiveForIssue(issue.companyId, issue.id),`):

```ts
        companyDocumentsSvc.renderDocument(issue.companyId, KNOWLEDGE_DOCUMENT_KEY),
```

And add the matching destructured name at the end of the array-destructuring list right above it (after `activeRecoveryAction,`):

```ts
      activeRecoveryAction,
      companyKnowledge,
    ] =
```

Then add `companyKnowledge,` to the final `res.json({ ... })` object, right after `currentExecutionWorkspace,` (line 2865):

```ts
      currentExecutionWorkspace,
      companyKnowledge,
    });
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx vitest run src/__tests__/issues-goal-context-routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/issues.ts server/src/__tests__/issues-goal-context-routes.test.ts
git commit -m "feat(server): inject company knowledge document into heartbeat-context"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck everything**

Run: `pnpm run typecheck`
Expected: exits 0.

- [ ] **Step 2: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass (or skip cleanly on hosts without embedded Postgres support, matching pre-existing behavior).

- [ ] **Step 3: Manual smoke test against a running dev server**

With the dev server up (see project memory on Windows dev-server quirks — check ports 3100/54329 are free first), run:

```bash
curl -s -X PATCH "http://127.0.0.1:3100/api/companies/<companyId>/documents/knowledge/facts" \
  -H "Content-Type: application/json" \
  -d '{"factKey":"backend-stack","value":"Next.js + Postgres on VPS Hostinger, NIE Vercel"}'

curl -s "http://127.0.0.1:3100/api/issues/<any-issue-id-in-that-company>/heartbeat-context" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).companyKnowledge))"
```

Expected: the `PATCH` returns 200 with the fact echoed back; the `heartbeat-context` call shows a non-null `companyKnowledge.body` containing `"backend-stack"` and `"Next.js + Postgres"`.

**Remember to stop the dev server and any orphaned `node`/`postgres` processes afterward** (see the project's known Windows dev-server quirks) so this smoke test doesn't leave the heartbeat scheduler running unattended.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git status
```

If clean, no further commit is needed — Tasks 1-6 already committed everything.

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** Task 1 = schema (spec §3), Task 2+3 = service incl. facts/warnings (spec §3, §4, decided thresholds), Task 4 = validators, Task 5 = routes (spec §3.1), Task 6 = heartbeat-context wiring (spec §4), Task 7 = verification (spec §6 testing intent). UI is explicitly out of scope per the approved design decision — no task builds one.
- **Known soft spot:** Task 5 Step 3 and Task 6 Step 2 reference test helpers (`createTestApp`, `createLocalTrustedBoardHeaders`, and the existing fixtures in `issues-goal-context-routes.test.ts`) whose **exact names were not verified against the live file** while writing this plan — the assigned engineer must open those files first and match real identifiers before writing the test, per the explicit note left in each step.
