/**
 * Barrel export for all marketing-ai tool registration functions.
 * Each function accepts (ctx, db) and registers one tool with the SDK.
 */
export { registerListProductsTool } from "./list-products.js";
export { registerProposeCampaignTool } from "./propose-campaign.js";
export { registerGenerateCreativeTool } from "./generate-creative.js";
export { registerSubmitForApprovalTool } from "./submit-for-approval.js";
export { registerFetchMetricsTool } from "./fetch-metrics.js";
export { registerPauseCampaignTool } from "./pause-campaign.js";
