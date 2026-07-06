import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyDocumentFacts, companyDocuments, documentRevisions, documents } from "@paperclipai/db";
import { issueDocumentKeySchema } from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";

export const KNOWLEDGE_DOCUMENT_KEY = "knowledge";

const SIZE_WARNING_THRESHOLD_CHARS = 4000;
const STALENESS_WARNING_DAYS = 30;

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

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
      }).catch((error: unknown) => {
        // Concurrent first-time creates for the same (companyId, key) can both pass the
        // existence check and collide on company_documents_company_key_uq; concurrent
        // updates with the same baseRevisionId collide on document_revisions_document_revision_uq.
        // Translate the raw pg 23505 into a 409 instead of leaking a 500.
        if (isUniqueViolation(error)) {
          throw conflict("Document already exists for this company", { key });
        }
        throw error;
      });
    },

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
  };
}
