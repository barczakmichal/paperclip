/**
 * channel-mirror.ts
 *
 * Standalone moduł mirror zwrotny: komentarz agenta w backing-issue → channel_messages.
 *
 * WAŻNE — brak cyklu importów:
 *   issues.ts → channel-mirror.ts (one-way)
 *   channel-mirror.ts NIE importuje issues.ts ani channels.ts
 */
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { channelMessages, issueComments, issues } from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";

/**
 * Mirroruje komentarz agenta z backing-issue do channel_messages.
 *
 * Idempotencja jest dwuwarstwowa:
 *   1. Szybka ścieżka aplikacyjna — SELECT po `backingIssueCommentId`, żeby uniknąć
 *      zbędnego INSERT-a i publikacji live-eventu dla już zmirrorowanego komentarza.
 *   2. Twarda gwarancja na poziomie DB — partial unique index
 *      `channel_messages_backing_comment_uq` na `backing_issue_comment_id
 *      WHERE backing_issue_comment_id IS NOT NULL` + `.onConflictDoNothing()`,
 *      odporna na wyścig dwóch równoległych mirrorów tego samego komentarza.
 */
export async function mirrorAgentCommentToChannel(
  db: Db,
  { commentId }: { commentId: string },
): Promise<void> {
  // 1. Załaduj wiersz komentarza
  const comment = await db
    .select({
      id: issueComments.id,
      issueId: issueComments.issueId,
      authorAgentId: issueComments.authorAgentId,
      body: issueComments.body,
      companyId: issueComments.companyId,
    })
    .from(issueComments)
    .where(eq(issueComments.id, commentId))
    .then((rows) => rows[0] ?? null);

  if (!comment) return;

  // 2. Tylko komentarze agentów (authorAgentId != null)
  if (!comment.authorAgentId) return;

  // 3. Załaduj issue — sprawdź originKind
  const issue = await db
    .select({
      originKind: issues.originKind,
      originId: issues.originId,
    })
    .from(issues)
    .where(eq(issues.id, comment.issueId))
    .then((rows) => rows[0] ?? null);

  if (!issue) return;
  if (issue.originKind !== "channel") return;

  const channelId = issue.originId;
  if (!channelId) return;

  // 4. Szybka ścieżka aplikacyjna (patrz docstring) — sprawdź czy channel_messages
  //    z tym backingIssueCommentId już istnieje, by uniknąć zbędnego INSERT-a.
  const existing = await db
    .select({ id: channelMessages.id })
    .from(channelMessages)
    .where(eq(channelMessages.backingIssueCommentId, commentId))
    .then((rows) => rows[0] ?? null);

  if (existing) return;

  // 5. Wstaw wiersz channel_messages. `.onConflictDoNothing()` (bez targetu — partial
  //    unique index wymagałby powtórzenia predykatu, a brak targetu łapie każdy
  //    konflikt unikalności) daje twardą gwarancję dedupu na poziomie DB przez index
  //    channel_messages_backing_comment_uq (odporność na wyścig). Gdy konflikt —
  //    INSERT nic nie wstawia, `.returning()` zwraca pustą tablicę.
  const [inserted] = await db
    .insert(channelMessages)
    .values({
      companyId: comment.companyId,
      channelId,
      authorAgentId: comment.authorAgentId,
      kind: "agent_reply",
      body: comment.body,
      mentionedAgentIds: [],
      backingIssueCommentId: commentId,
    })
    .onConflictDoNothing()
    .returning();

  // 6. Duplikat (wyścig) — wiersz wstawił inny call, nic nie publikujemy.
  if (!inserted) return;

  // 7. Opublikuj live event
  publishLiveEvent({
    companyId: comment.companyId,
    type: "channel.message.created",
    payload: { channelId, messageId: inserted.id },
  });
}
