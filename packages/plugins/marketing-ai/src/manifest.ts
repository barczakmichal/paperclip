import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Marketing AI",
  description: "Agent-driven Meta Ads + Google Ads campaigns with AI creative generation and human-in-the-loop approval.",
  author: "Paperclip",
  categories: ["automation", "connector"],
  capabilities: [
    "companies.read",
    "agents.read",
    "plugin.state.read",
    "plugin.state.write",
    "secrets.read-ref",
    "agent.tools.register",
    "instance.settings.register",
    "ui.sidebar.register",
    "ui.page.register",
    "http.outbound",
    "events.emit",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      metaAccessTokenRef: {
        type: "string",
        format: "secret-ref",
        title: "Meta Access Token (secret ref)",
      },
      metaLongLivedTokenRef: {
        type: "string",
        format: "secret-ref",
        title: "Meta Long-Lived Token (secret ref)",
      },
      metaAdAccountIdRef: {
        type: "string",
        format: "secret-ref",
        title: "Meta Ad Account ID (secret ref)",
      },
      googleRefreshTokenRef: {
        type: "string",
        format: "secret-ref",
        title: "Google Refresh Token (secret ref)",
      },
      googleCustomerIdRef: {
        type: "string",
        format: "secret-ref",
        title: "Google Customer ID (secret ref)",
      },
      googleDeveloperTokenRef: {
        type: "string",
        format: "secret-ref",
        title: "Google Developer Token (secret ref)",
      },
    },
  },
  tools: [
    {
      name: "marketing.list_products",
      displayName: "List Shop Products",
      description:
        "Fetches product catalog from the connected shop (Shopify). Returns id, title, price, image_urls, stock.",
      parametersSchema: {
        type: "object",
        properties: {
          category: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "marketing.propose_campaign",
      displayName: "Propose Marketing Campaign",
      description:
        "Creates a campaign proposal with AI-generated brief. Saves to DB as draft. Does NOT publish to Meta/Google.",
      parametersSchema: {
        type: "object",
        required: ["platform", "goal", "product_ids", "budget_daily_pln", "duration_days"],
        properties: {
          platform: { type: "string", enum: ["meta", "google"] },
          goal: { type: "string", enum: ["sales", "awareness", "leads"] },
          product_ids: { type: "array", items: { type: "string" } },
          budget_daily_pln: { type: "number" },
          duration_days: { type: "integer" },
          audience_brief: { type: "string" },
        },
      },
    },
    {
      name: "marketing.generate_creative",
      displayName: "Generate Campaign Creative",
      description:
        "Generates ad copy (Claude) + composed image (sharp/GPT-Image-1) for a proposal. Saves to creatives table.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "format"],
        properties: {
          proposal_id: { type: "string" },
          format: { type: "string", enum: ["single_image", "carousel"] },
          headline_count: { type: "integer" },
          body_count: { type: "integer" },
        },
      },
    },
    {
      name: "marketing.submit_for_approval",
      displayName: "Submit Campaign for Approval",
      description:
        "Submits a campaign proposal + creatives for human review. Creates an Approval record visible in Paperclip UI.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "creative_ids"],
        properties: {
          proposal_id: { type: "string" },
          creative_ids: { type: "array", items: { type: "string" } },
          comments: { type: "string" },
        },
      },
    },
    {
      name: "marketing.fetch_metrics",
      displayName: "Fetch Campaign Metrics",
      description:
        "Fetches ROAS, CTR, spend, conversions from Meta or Google. Normalizes spend to PLN via NBP fixing rate.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          campaign_id: { type: "string" },
          since: { type: "string" },
          until: { type: "string" },
        },
      },
    },
    {
      name: "marketing.pause_campaign",
      displayName: "Pause Campaign",
      description:
        "Pauses a live campaign on Meta or Google. Updates status in DB and writes audit log.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id", "reason"],
        properties: {
          campaign_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "marketing-ai-page",
        displayName: "Marketing",
        exportName: "MarketingPluginPage",
        routePath: "marketing",
      },
      {
        type: "sidebar",
        id: "marketing-ai-sidebar",
        displayName: "Marketing",
        exportName: "MarketingSidebarLink",
      },
    ],
  },
};

export default manifest;
