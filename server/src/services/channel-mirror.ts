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
 * Idempotencja jest APLIKACYJNA, na poziomie pojedynczego call-site: funkcja jest
 * wołana dokładnie raz per `issueService.addComment` (jedno synchroniczne miejsce),
 * więc dedup SELECT-then-INSERT po `backingIssueCommentId` wystarcza w praktyce.
 * Docelowym hardeningiem (świadomy defer, NIE robimy teraz) byłby partial unique
 * index na `channel_messages.backing_issue_comment_id WHERE backing_issue_comment_id
 * IS NOT NULL` + `.onConflictDoNothing()`, co dałoby gwarancję na poziomie DB.
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

  // 4. Dedup aplikacyjny (patrz docstring) — sprawdź czy channel_messages
  //    z tym backingIssueCommentId już istnieje.
  const existing = await db
    .select({ id: channelMessages.id })
    .from(channelMessages)
    .where(eq(channelMessages.backingIssueCommentId, commentId))
    .then((rows) => rows[0] ?? null);

  if (existing) return;

  // 5. Wstaw wiersz channel_messages
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
    .returning();

  // 6. Opublikuj live event
  publishLiveEvent({
    companyId: comment.companyId,
    type: "channel.message.created",
    payload: { channelId, messageId: inserted.id },
  });
}
