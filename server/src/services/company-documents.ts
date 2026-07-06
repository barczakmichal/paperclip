import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyDocuments, documentRevisions, documents } from "@paperclipai/db";
import { issueDocumentKeySchema } from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";

export const KNOWLEDGE_DOCUMENT_KEY = "knowledge";

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
