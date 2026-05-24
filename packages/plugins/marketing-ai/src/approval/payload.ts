/**
 * Typed payload stored in the core `approvals.payload` JSONB column
 * when the marketing plugin submits a campaign for human review.
 */
export interface MarketingCampaignApprovalPayload {
  proposalId: string;
  creativeIds: string[];
  comments?: string;
  // Snapshot for UI display — avoids extra fetch on approval card render
  platform: string;
  goal: string;
  budgetDailyPln: string;
  durationDays: number;
  audienceBrief?: string;
}
