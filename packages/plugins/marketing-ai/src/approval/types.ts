/**
 * Shared types for the marketing-ai approval pipeline.
 */

/** Payload stored in the core `approvals.payload` column for type=marketing_campaign. */
export interface MarketingCampaignApprovalPayload {
  proposalId: string;
  creativeIds: string[];
  comments?: string;
  // Snapshot of proposal data for UI rendering without a separate fetch.
  platform: string;
  goal: string;
  budgetDailyPln: string;
  durationDays: number;
  audienceBrief?: string;
}
