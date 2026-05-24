/**
 * handler.ts — approval decision handler for marketing_campaign approvals.
 *
 * Subscribes to the `approval.decided` SDK event.  When the type is
 * `"marketing_campaign"` it routes to one of three branches:
 *
 *   approved          → enforce cap → publish campaign (update status to "live")
 *   rejected          → archive creatives, set proposal status to "rejected"
 *   revision_requested → revert proposal to "draft", emit plugin event for agent
 *
 * All branches write to `marketing_audit_log` via `writeAuditLog`.
 *
 * NOTE on event wiring (see report):
 * The SDK's PLUGIN_EVENT_TYPES list includes "approval.decided".
 * The server currently fires "approval.approved" / "approval.rejected" /
 * "approval.revision_requested" via logActivity, but those strings are NOT in
 * PLUGIN_EVENT_TYPES so they are not forwarded to plugins.
 * The handler listens to "approval.decided" as specified; wiring on the server
 * side to emit that event is a separate concern (outside plugin scope).
 */

import { eq, inArray } from "drizzle-orm";
import { campaignProposals, creatives } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import { enforceMarketingCap, MarketingCapExceededError } from "./cap-enforcement.js";
import { writeAuditLog } from "./audit-log.js";
import type { MarketingCampaignApprovalPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Internal event shape
// ---------------------------------------------------------------------------

/**
 * Subset of the approval.decided event payload that the handler cares about.
 * The full payload is `PluginEvent.payload` which includes `details` from the
 * server's logActivity call.
 */
interface ApprovalDecidedPayload {
  /** UUID of the approval record. */
  approvalId?: string;
  /** Approval type — must be "marketing_campaign" for this handler to act. */
  type?: string;
  /** Resolved status after the decision. */
  approvalStatus?: "approved" | "rejected" | "revision_requested";
  /** User ID of the operator who decided. */
  decidedByUserId?: string;
  /** Optional free-text note from the operator. */
  decisionNote?: string;
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

/**
 * Register the approval.decided event listener.
 *
 * @param ctx - Plugin context from setup()
 * @param db  - Drizzle DB client injected from the plugin host
 */
export function registerApprovalHandler(ctx: PluginContext, db: Db): void {
  ctx.events.on("approval.decided", async (event: PluginEvent) => {
    const data = event.payload as ApprovalDecidedPayload;

    // This handler only processes marketing campaign approvals.
    if (data.type !== "marketing_campaign") return;

    // The approval ID is both the entityId on the event envelope and the
    // approvalId field in the payload — prefer entityId for robustness.
    const approvalId = event.entityId ?? data.approvalId;
    if (!approvalId) {
      ctx.logger.warn("approval.decided event missing approvalId", { event });
      return;
    }

    const companyId = event.companyId;
    const decidedByUserId = data.decidedByUserId;
    const decisionNote = data.decisionNote;

    // We need the proposal payload; the approval row is the source of truth.
    // Load the campaign proposal via the approval_id FK stored on the proposal.
    const [proposal] = await db
      .select()
      .from(campaignProposals)
      .where(eq(campaignProposals.approvalId, approvalId));

    if (!proposal) {
      ctx.logger.warn("No campaign proposal linked to approvalId", { approvalId });
      return;
    }

    const proposalId = proposal.id;

    // Extract creativeIds from the proposal's approval payload snapshot.
    // They were stored when submit_for_approval inserted the approval row.
    // We fall back to an empty array if the payload is unavailable here
    // (the full payload lives in the approvals table which we query separately).
    // For the archive step we re-query by proposalId instead.

    const status = data.approvalStatus ?? "rejected";

    // ── Approved ────────────────────────────────────────────────────────────
    if (status === "approved") {
      try {
        await enforceMarketingCap(db, {
          companyId,
          proposalId,
          fetchMetricsFn: async (_id) => ({ spendPln: 0 }), // stub — real adapter wired at T13
        });

        // Publish: set status to "live".
        // Real platform adapter call (createCampaign) goes here once adapters
        // are wired; for now we record the intent as "live".
        await db
          .update(campaignProposals)
          .set({ status: "live", publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(campaignProposals.id, proposalId));

        await writeAuditLog(db, {
          companyId,
          action: "approval.approved",
          entityId: proposalId,
          userId: decidedByUserId,
          payloadDiff: { approvalId, decisionNote },
        });

        await writeAuditLog(db, {
          companyId,
          action: "campaign.published",
          entityId: proposalId,
          userId: decidedByUserId,
          payloadDiff: { approvalId },
        });

        ctx.logger.info("Campaign published after approval", { proposalId, approvalId });
      } catch (err) {
        const isCapErr = err instanceof MarketingCapExceededError;
        const errMsg = err instanceof Error ? err.message : String(err);

        // Revert to draft with the error reason so the agent can see it.
        await db
          .update(campaignProposals)
          .set({ status: "draft", rejectionReason: errMsg, updatedAt: new Date() })
          .where(eq(campaignProposals.id, proposalId));

        await writeAuditLog(db, {
          companyId,
          action: isCapErr ? "cap.exceeded" : "campaign.publish_failed",
          entityId: proposalId,
          payloadDiff: { error: errMsg, approvalId },
        });

        ctx.logger.error("Campaign publish failed after approval", {
          proposalId,
          approvalId,
          error: errMsg,
        });
      }
      return;
    }

    // ── Rejected ─────────────────────────────────────────────────────────────
    if (status === "rejected") {
      await db
        .update(campaignProposals)
        .set({ status: "rejected", rejectionReason: decisionNote ?? null, updatedAt: new Date() })
        .where(eq(campaignProposals.id, proposalId));

      // Archive all creatives attached to this proposal.
      await db
        .update(creatives)
        .set({ status: "archived", updatedAt: new Date() })
        .where(inArray(creatives.proposalId, [proposalId]));

      await writeAuditLog(db, {
        companyId,
        action: "approval.rejected",
        entityId: proposalId,
        userId: decidedByUserId,
        payloadDiff: { reason: decisionNote, approvalId },
      });

      ctx.logger.info("Campaign rejected, creatives archived", {
        proposalId,
        approvalId,
        reason: decisionNote,
      });
      return;
    }

    // ── Revision requested ───────────────────────────────────────────────────
    if (status === "revision_requested") {
      await db
        .update(campaignProposals)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(campaignProposals.id, proposalId));

      await writeAuditLog(db, {
        companyId,
        action: "approval.revision_requested",
        entityId: proposalId,
        userId: decidedByUserId,
        payloadDiff: { note: decisionNote, approvalId },
      });

      // Emit a plugin-namespaced event so the marketing agent can pick up the
      // revision request and re-run the creative pipeline.
      await ctx.events.emit("marketing.revision_requested", companyId, {
        proposalId,
        note: decisionNote,
        approvalId,
      });

      ctx.logger.info("Revision requested for proposal, agent notified", {
        proposalId,
        approvalId,
        note: decisionNote,
      });
    }
  });
}
