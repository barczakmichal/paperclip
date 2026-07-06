import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "meta-ads";
export const PLUGIN_VERSION = "0.1.0";

// Default secret references (company_secrets.id primary keys — POINTERS, not
// secret values; they resolve to nothing without the encrypted vault + master
// key). These live here as defaults ONLY because per-plugin config currently
// rejects secret refs server-side (HTTP 422, see plugin-secrets-handler.ts) and
// plugin workers get a stripped env. TODO: once company-scoped plugin config
// lands, move these out of source into per-company config and drop the
// corresponding .gitleaks.toml allowlist. Operators can already override each
// value via the plugin instance config below.
export const DEFAULT_CONFIG = {
  // Secret UUIDs (from company_secrets.id)
  tokenSecretRef: "b09cac61-7275-452a-92da-adcad0de6f9f",      // Meta System User Token
  accountIdSecretRef: "18abae0a-5c80-42ce-b6c6-43ada85d87d4",  // Meta Ad Account ID
  appIdSecretRef: "3f51657c-f553-4408-ae2e-9a41eb52f4b5",      // Meta App ID
  appSecretSecretRef: "94e8d467-ebf2-4c7a-b3cf-6f85b42ecbe0",  // Meta App Secret
  pageIdSecretRef: "e3f3642f-bbcc-43b4-994f-5cb4453d7a61",     // Meta Page ID
  // Guardrails
  dailyLimitCents: 10000,      // 100 PLN
  monthlyLimitCents: 200000,   // 2000 PLN
  approvalThresholdCents: 50000, // 500 PLN
  budgetIncreaseMaxPct: 20,
  apiVersion: "v22.0",
};

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Meta Ads",
  description:
    "Manage Facebook and Instagram ad campaigns via Meta Marketing API v22. " +
    "Guardrails (spend cap, approval threshold, audit log) enforced server-side in the plugin.",
  author: "Treefish (SKL)",
  categories: ["automation", "connector"],
  capabilities: [
    "secrets.read-ref",
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "issues.read",
    "issues.create",
    "activity.log.write",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      tokenSecretRef: {
        type: "string",
        title: "Token Secret UUID",
        description: "UUID of the 'Meta System User Token' secret in Paperclip vault",
        default: DEFAULT_CONFIG.tokenSecretRef,
      },
      accountIdSecretRef: {
        type: "string",
        title: "Ad Account ID Secret UUID",
        description: "UUID of the 'Meta Ad Account ID' secret (format: act_XXXXXXXXX)",
        default: DEFAULT_CONFIG.accountIdSecretRef,
      },
      appIdSecretRef: {
        type: "string",
        title: "App ID Secret UUID",
        description: "UUID of the 'Meta App ID' secret",
        default: DEFAULT_CONFIG.appIdSecretRef,
      },
      appSecretSecretRef: {
        type: "string",
        title: "App Secret Secret UUID",
        description: "UUID of the 'Meta App Secret' secret",
        default: DEFAULT_CONFIG.appSecretSecretRef,
      },
      pageIdSecretRef: {
        type: "string",
        title: "Page ID Secret UUID",
        description: "UUID of the 'Meta Page ID' secret",
        default: DEFAULT_CONFIG.pageIdSecretRef,
      },
      dailyLimitCents: {
        type: "number",
        title: "Daily Spend Cap (grosze)",
        description: "Hard daily spend limit in Polish grosze (100 = 1 PLN). Default: 10000 = 100 PLN",
        default: DEFAULT_CONFIG.dailyLimitCents,
      },
      monthlyLimitCents: {
        type: "number",
        title: "Monthly Spend Cap (grosze)",
        description: "Hard monthly spend limit in Polish grosze. Default: 200000 = 2000 PLN",
        default: DEFAULT_CONFIG.monthlyLimitCents,
      },
      approvalThresholdCents: {
        type: "number",
        title: "Approval Threshold (grosze)",
        description: "Budget actions above this value require board approval. Default: 50000 = 500 PLN",
        default: DEFAULT_CONFIG.approvalThresholdCents,
      },
      budgetIncreaseMaxPct: {
        type: "number",
        title: "Max Auto Budget Increase (%)",
        description: "Budget increases above this % require board approval. Default: 20",
        default: DEFAULT_CONFIG.budgetIncreaseMaxPct,
      },
      apiVersion: {
        type: "string",
        title: "Meta API Version",
        description: "Meta Marketing API version to use",
        default: DEFAULT_CONFIG.apiVersion,
      },
    },
  },
  tools: [
    {
      name: "meta-ads/list-campaigns",
      displayName: "List Meta Ad Campaigns",
      description:
        "Lists campaigns on the connected Meta ad account. " +
        "Read-only. Returns id, name, status, objective, budget for each campaign.",
      parametersSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Comma-separated statuses to filter: ACTIVE, PAUSED, ARCHIVED, DELETED. " +
              "Default: ACTIVE,PAUSED",
          },
          limit: {
            type: "number",
            description: "Max number of campaigns to return. Default: 50",
          },
        },
      },
    },
    {
      name: "meta-ads/get-insights",
      displayName: "Get Meta Ads Insights",
      description:
        "Returns performance metrics for the ad account or a specific campaign. " +
        "Read-only. Metrics include spend, impressions, clicks, CPM, CTR, ROAS, conversions.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: {
            type: "string",
            description: "Optional campaign ID. If omitted, returns account-level insights.",
          },
          dateRange: {
            type: "string",
            description:
              "Date preset: yesterday, last_7d, last_30d, this_month, last_month. Default: last_7d",
          },
          metrics: {
            type: "string",
            description:
              "Comma-separated metric fields. Default: spend,impressions,clicks,cpm,ctr,actions",
          },
          level: {
            type: "string",
            description: "Breakdown level: account, campaign, adset, ad. Default: campaign",
          },
        },
      },
    },
    {
      name: "meta-ads/set-budget",
      displayName: "Set Meta Campaign Budget",
      description:
        "Updates the daily budget of a campaign. " +
        "Guardrails applied: hard spend cap, approval required for increases > configured threshold %. " +
        "Returns approval task ID when manual review is needed.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID to update" },
          dailyBudgetCents: {
            type: "number",
            description: "New daily budget in Polish grosze (100 = 1 PLN)",
          },
          approvalTaskId: {
            type: "string",
            description:
              "ID of an already-approved Paperclip task. Required when the budget increase exceeds the auto-approve threshold.",
          },
        },
        required: ["campaignId", "dailyBudgetCents"],
      },
    },
    {
      name: "meta-ads/create-campaign",
      displayName: "Create Meta Ad Campaign",
      description:
        "Creates a new campaign on the connected Meta ad account. " +
        "Guardrails applied: hard spend cap, approval required for budgets above configured threshold. " +
        "Returns approval task ID when manual review is needed.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          objective: {
            type: "string",
            description:
              "Campaign objective: OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT",
          },
          dailyBudgetCents: {
            type: "number",
            description: "Daily budget in Polish grosze (100 = 1 PLN)",
          },
          status: {
            type: "string",
            description: "Initial status: ACTIVE or PAUSED. Default: PAUSED",
          },
          startDate: {
            type: "string",
            description: "Start date YYYY-MM-DD (optional)",
          },
          approvalTaskId: {
            type: "string",
            description: "ID of an already-approved Paperclip task (required when budget exceeds threshold)",
          },
        },
        required: ["name", "objective", "dailyBudgetCents"],
      },
    },
    {
      name: "meta-ads/pause-campaign",
      displayName: "Pause Meta Ad Campaign",
      description:
        "Pauses an active campaign. Always requires board approval via Paperclip task. " +
        "On first call (no approvalTaskId): creates approval task and returns its ID. " +
        "On second call (with approvalTaskId): verifies approval and applies the pause.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID to pause" },
          reason: { type: "string", description: "Business reason for pausing (for audit log)" },
          approvalTaskId: {
            type: "string",
            description: "ID of the Paperclip approval task. Required to actually execute the pause.",
          },
        },
        required: ["campaignId"],
      },
    },
    {
      name: "meta-ads/resume-campaign",
      displayName: "Resume Meta Ad Campaign",
      description:
        "Resumes a paused campaign. Always requires board approval via Paperclip task. " +
        "On first call (no approvalTaskId): creates approval task and returns its ID. " +
        "On second call (with approvalTaskId): verifies approval and sets campaign ACTIVE.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID to resume" },
          reason: { type: "string", description: "Business reason for resuming (for audit log)" },
          approvalTaskId: {
            type: "string",
            description: "ID of the Paperclip approval task. Required to actually execute the resume.",
          },
        },
        required: ["campaignId"],
      },
    },
    {
      name: "meta-ads/delete-campaign",
      displayName: "Delete Meta Ad Campaign",
      description:
        "Permanently deletes a campaign (sets status to DELETED). " +
        "Safety guard: only campaigns whose name starts with '[TEST-' can be deleted via this tool. " +
        "Use for cleanup of test campaigns only. No spend risk, no approval required.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: { type: "string", description: "Campaign ID to delete" },
          reason: { type: "string", description: "Reason for deletion (for audit log)" },
        },
        required: ["campaignId"],
      },
    },
  ],
};

export default manifest;
