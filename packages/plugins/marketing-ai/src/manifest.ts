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
    // Tool registration added in C2.
    // Stubs defined here so manifest compiles.
  ],
  ui: {
    slots: [
      // UI slots added in C2.
    ],
  },
};

export default manifest;
