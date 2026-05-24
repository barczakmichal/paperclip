# Broadcast Edition — Faza C1: Plugin Scaffold + OAuth + Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md](../specs/2026-05-24-paperclip-broadcast-edition-design.md) (sections 7, 9, 10)

**Goal:** Postawić fundament pluginu Marketing AI — strukturę pakietu, rejestrację w workspace, OAuth dla Meta i Google Ads, oraz adaptery do obu platform (campaign CRUD + metrics).

**Architecture:** Plugin jako samodzielny pakiet `@paperclipai/plugin-marketing-ai` w `packages/plugins/marketing-ai/`. OAuth endpointy dodane do serwera Express jako dedykowane route. Tokeny przechowywane w istniejącym `company_secrets` (encrypted at rest przez `local-encrypted-provider`). Adaptery używają oficjalnych SDK: `facebook-nodejs-business-sdk` i `google-ads-api`. Sekrety ładowane przez `ctx.secrets.resolve()` (Plugin SDK) — nigdy hardkodowane.

**Tech Stack:**
- Plugin SDK: `@paperclipai/plugin-sdk` (workspace:*)
- Meta: `facebook-nodejs-business-sdk`
- Google: `google-ads-api`
- OAuth utils: `node:crypto` (PKCE state), `node:https` (token exchange)
- NBP API: fetch do `api.nbp.pl/api/exchangerates/rates/a/usd/` (no extra dep)
- Vitest + Node environment (testy serverside, bez jsdom)
- TypeScript strict, ESM (`"type": "module"`)

---

## File Structure (Faza C1)

```
packages/plugins/marketing-ai/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                          plugin entry + manifest
│   ├── constants.ts
│   ├── adapters/
│   │   ├── meta-ads/
│   │   │   ├── client.ts                 SDK wrapper + token loading
│   │   │   ├── campaigns.ts              createCampaign / pauseCampaign / getCampaign
│   │   │   └── insights.ts               fetchInsights → spend/impressions/clicks/ROAS
│   │   ├── google-ads/
│   │   │   ├── client.ts
│   │   │   ├── campaigns.ts
│   │   │   └── metrics.ts
│   │   └── nbp.ts                        PLN conversion helper
│   ├── tools/                            (stubs — wypełniane w C2)
│   │   └── .gitkeep
│   ├── approval/                         (stubs — C2)
│   │   └── .gitkeep
│   ├── creative/                         (stubs — C2)
│   │   └── .gitkeep
│   └── ui/                               (stubs — C2)
│       └── .gitkeep
├── server-routes/
│   ├── meta-oauth.ts                     GET /oauth/meta/start + /callback
│   └── google-oauth.ts                   GET /oauth/google/start + /callback
└── tests/
    ├── meta-adapter.test.ts
    └── google-adapter.test.ts
```

**Modyfikowane pliki:**
- `vitest.config.ts` — dodanie `packages/plugins/marketing-ai` do `projects`
- `pnpm-workspace.yaml` — już obsługuje `packages/plugins/*`, bez zmian
- `server/src/routes/index.ts` — import i montowanie `server-routes/`

---

## Conventions for this plan

- **Commit po każdym Tasku** — prefix `feat(marketing-ai):`
- **Brak `any`** — `unknown` + type narrowing
- **Sekrety** — ładowane przez `ctx.secrets.resolve(secretRef)`, nigdy z env w produkcji
- **OAuth state** — PKCE-style random hex 32 bajtów, sprawdzany przy callbacku
- **Branch:** `feature/broadcast-c-marketing-ai` (Task 1)

---

## Phase C1.1 — Plugin Scaffold

### Task 1: Branch + struktura katalogów

**Files:**
- Create: `packages/plugins/marketing-ai/src/index.ts`
- Create: `packages/plugins/marketing-ai/src/constants.ts`
- Create: `packages/plugins/marketing-ai/src/tools/.gitkeep`
- Create: `packages/plugins/marketing-ai/src/approval/.gitkeep`
- Create: `packages/plugins/marketing-ai/src/creative/.gitkeep`
- Create: `packages/plugins/marketing-ai/src/ui/.gitkeep`
- Create: `packages/plugins/marketing-ai/src/adapters/meta-ads/.gitkeep`
- Create: `packages/plugins/marketing-ai/src/adapters/google-ads/.gitkeep`
- Create: `packages/plugins/marketing-ai/server-routes/.gitkeep`
- Create: `packages/plugins/marketing-ai/tests/.gitkeep`

- [ ] **Step 1: Stwórz branch**

```bash
git checkout master
git pull
git checkout -b feature/broadcast-c-marketing-ai
```

- [ ] **Step 2: Utwórz puste barrel entry**

`packages/plugins/marketing-ai/src/constants.ts`:
```ts
export const PLUGIN_ID = "marketing-ai" as const;
export const PLUGIN_VERSION = "0.1.0" as const;

export const SECRET_KEYS = {
  metaAccessToken: "marketing-ai/meta/access_token",
  metaLongLivedToken: "marketing-ai/meta/long_lived_token",
  metaAdAccountId: "marketing-ai/meta/ad_account_id",
  googleRefreshToken: "marketing-ai/google/refresh_token",
  googleCustomerId: "marketing-ai/google/customer_id",
  googleDeveloperToken: "marketing-ai/google/developer_token",
} as const;

export const TOOL_NAMES = {
  listProducts: "marketing.list_products",
  proposeCampaign: "marketing.propose_campaign",
  generateCreative: "marketing.generate_creative",
  submitForApproval: "marketing.submit_for_approval",
  fetchMetrics: "marketing.fetch_metrics",
  pauseCampaign: "marketing.pause_campaign",
} as const;
```

`packages/plugins/marketing-ai/src/index.ts`:
```ts
// Plugin Marketing AI — entry point.
// Tools and UI slots registered in C2.
export { default as manifest } from "./manifest.js";
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/marketing-ai/
git commit -m "feat(marketing-ai): scaffold plugin directory structure"
```

---

### Task 2: package.json + tsconfig

**Files:**
- Create: `packages/plugins/marketing-ai/package.json`
- Create: `packages/plugins/marketing-ai/tsconfig.json`

- [ ] **Step 1: package.json**

```json
{
  "name": "@paperclipai/plugin-marketing-ai",
  "version": "0.1.0",
  "description": "Marketing AI plugin for Paperclip — Meta Ads + Google Ads integration with AI creative generation",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./server-routes": "./server-routes/index.ts"
  },
  "paperclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js",
    "ui": "./dist/ui/"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@paperclipai/plugin-sdk": "workspace:*",
    "@paperclipai/shared": "workspace:*",
    "facebook-nodejs-business-sdk": "^20.0.0",
    "google-ads-api": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.8",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "extends": "../../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2023"],
    "jsx": "react-jsx"
  },
  "include": ["src", "server-routes", "tests"]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/marketing-ai/package.json packages/plugins/marketing-ai/tsconfig.json
git commit -m "feat(marketing-ai): add package.json and tsconfig"
```

---

### Task 3: Manifest + vitest registration

**Files:**
- Create: `packages/plugins/marketing-ai/src/manifest.ts`
- Create: `packages/plugins/marketing-ai/vitest.config.ts`
- Modify: `vitest.config.ts` (root)

- [ ] **Step 1: Manifest**

`packages/plugins/marketing-ai/src/manifest.ts`:
```ts
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./constants.js";

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
```

- [ ] **Step 2: vitest.config.ts dla pluginu**

`packages/plugins/marketing-ai/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Zarejestruj w root vitest.config.ts**

W `vitest.config.ts` (root), w tablicy `projects`, dodaj wpis:
```ts
"packages/plugins/marketing-ai",
```

- [ ] **Step 4: Commit**

```bash
git add packages/plugins/marketing-ai/src/manifest.ts packages/plugins/marketing-ai/vitest.config.ts vitest.config.ts
git commit -m "feat(marketing-ai): add manifest, vitest config, register in workspace"
```

---

## Phase C1.2 — Meta OAuth

### Task 4: Meta OAuth flow (server route)

**Files:**
- Create: `packages/plugins/marketing-ai/server-routes/meta-oauth.ts`
- Create: `packages/plugins/marketing-ai/server-routes/index.ts`

OAuth2 flow: `GET /api/plugins/marketing-ai/oauth/meta/start` → redirect do Facebook, `GET /api/plugins/marketing-ai/oauth/meta/callback` → token exchange → zapis w `company_secrets`.

- [ ] **Step 1: server-routes/meta-oauth.ts**

```ts
import { randomBytes } from "node:crypto";
import type { Router, Request, Response } from "express";

// State cache: state hex -> companyId (in-process, expires 10min).
const pendingStates = new Map<string, { companyId: string; expiresAt: number }>();

export function registerMetaOAuthRoutes(router: Router, deps: {
  getMetaAppId: () => string;
  getMetaAppSecret: () => string;
  saveSecret: (companyId: string, key: string, value: string) => Promise<void>;
}): void {
  const REDIRECT_URI = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/api/plugins/marketing-ai/oauth/meta/callback`
    : "http://localhost:3100/api/plugins/marketing-ai/oauth/meta/callback";

  // Step 1: initiate OAuth — caller passes ?companyId=...
  router.get("/oauth/meta/start", (req: Request, res: Response) => {
    const companyId = req.query["companyId"] as string | undefined;
    if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

    const state = randomBytes(32).toString("hex");
    pendingStates.set(state, { companyId, expiresAt: Date.now() + 10 * 60_000 });

    const params = new URLSearchParams({
      client_id: deps.getMetaAppId(),
      redirect_uri: REDIRECT_URI,
      scope: "ads_management,ads_read,business_management",
      response_type: "code",
      state,
    });
    res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params}`);
  });

  // Step 2: callback — exchange code for token, save secrets
  router.get("/oauth/meta/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) { res.status(400).json({ error }); return; }

    const pending = state ? pendingStates.get(state) : undefined;
    if (!pending || pending.expiresAt < Date.now()) {
      res.status(400).json({ error: "Invalid or expired OAuth state" });
      return;
    }
    pendingStates.delete(state);
    const { companyId } = pending;

    // Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", deps.getMetaAppId());
    tokenUrl.searchParams.set("client_secret", deps.getMetaAppSecret());
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      res.status(502).json({ error: "Meta token exchange failed" });
      return;
    }
    const tokenJson = await tokenRes.json() as { access_token: string };
    const shortToken = tokenJson.access_token;

    // Exchange for long-lived token
    const llUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", deps.getMetaAppId());
    llUrl.searchParams.set("client_secret", deps.getMetaAppSecret());
    llUrl.searchParams.set("fb_exchange_token", shortToken);

    const llRes = await fetch(llUrl.toString());
    const llJson = await llRes.json() as { access_token: string };
    const longToken = llJson.access_token;

    // Fetch ad account ID (first account user has access to)
    const accsRes = await fetch(
      `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name&access_token=${longToken}`
    );
    const accsJson = await accsRes.json() as { data: Array<{ id: string }> };
    const adAccountId = accsJson.data?.[0]?.id ?? "";

    await Promise.all([
      deps.saveSecret(companyId, "marketing-ai/meta/access_token", shortToken),
      deps.saveSecret(companyId, "marketing-ai/meta/long_lived_token", longToken),
      deps.saveSecret(companyId, "marketing-ai/meta/ad_account_id", adAccountId),
    ]);

    // Redirect back to settings page
    res.redirect("/settings/plugins/marketing-ai?meta=connected");
  });
}
```

`packages/plugins/marketing-ai/server-routes/index.ts`:
```ts
export { registerMetaOAuthRoutes } from "./meta-oauth.js";
export { registerGoogleOAuthRoutes } from "./google-oauth.js";
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/server-routes/
git commit -m "feat(marketing-ai): Meta OAuth flow — start + callback endpoints"
```

---

### Task 5: Settings UI — Marketing AI page (Meta connect)

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/SettingsPage.tsx`

Minimalna strona ustawień z przyciskiem "Connect Meta" i statusem. Kod piszemy jako Plugin SDK `settingsPage` slot — wyrenderowany wewnątrz plugin iframe.

- [ ] **Step 1: SettingsPage.tsx (Meta section)**

```tsx
import { useState } from "react";
import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";

export function SettingsPage({ config }: PluginSettingsPageProps) {
  const { companyId } = useHostContext();
  const [metaStatus] = useState<"connected" | "disconnected">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("meta") === "connected" ? "connected" : "disconnected";
  });

  function handleConnectMeta() {
    const url = `/api/plugins/marketing-ai/oauth/meta/start?companyId=${companyId}`;
    window.location.href = url;
  }

  return (
    <div className="p-6 space-y-8 max-w-xl">
      <h2 className="text-lg font-semibold">Marketing AI — Connections</h2>

      {/* Meta section */}
      <section className="space-y-2">
        <h3 className="font-medium">Meta Ads</h3>
        {metaStatus === "connected" ? (
          <p className="text-sm text-green-500">Connected</p>
        ) : (
          <p className="text-sm text-muted-foreground">Not connected</p>
        )}
        <button
          type="button"
          onClick={handleConnectMeta}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
        >
          {metaStatus === "connected" ? "Reconnect Meta" : "Connect Meta"}
        </button>
      </section>

      {/* Google section — placeholder, filled in T8 */}
      <section className="space-y-2">
        <h3 className="font-medium">Google Ads</h3>
        <p className="text-sm text-muted-foreground">Not connected</p>
        <button type="button" disabled className="px-4 py-2 rounded bg-muted text-muted-foreground text-sm cursor-not-allowed">
          Connect Google (coming soon)
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Zarejestruj slot w manifest**

W `src/manifest.ts` w `ui.slots` dodaj:
```ts
{
  type: "settingsPage",
  id: "marketing-ai-settings",
  displayName: "Marketing AI",
  exportName: "SettingsPage",
},
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/marketing-ai/src/ui/SettingsPage.tsx packages/plugins/marketing-ai/src/manifest.ts
git commit -m "feat(marketing-ai): settings UI page with Meta connect button"
```

---

### Task 6: Test Meta OAuth (mock token exchange)

**Files:**
- Create: `packages/plugins/marketing-ai/tests/meta-oauth.test.ts`

- [ ] **Step 1: test**

```ts
import { describe, it, expect, vi } from "vitest";

// Mock fetch globally for this test module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stub
const { registerMetaOAuthRoutes } = await import("../server-routes/meta-oauth.js");

describe("Meta OAuth — registerMetaOAuthRoutes", () => {
  it("saves three secrets on successful callback", async () => {
    const saved: Record<string, string> = {};

    // Simulate Express router object
    const routes: Record<string, (req: unknown, res: unknown) => void> = {};
    const router = {
      get: (path: string, handler: (req: unknown, res: unknown) => void) => {
        routes[path] = handler;
      },
    };

    registerMetaOAuthRoutes(router as never, {
      getMetaAppId: () => "APP_ID",
      getMetaAppSecret: () => "APP_SECRET",
      saveSecret: async (_, key, value) => { saved[key] = value; },
    });

    // Prime state via start handler (simulated)
    const startReq = { query: { companyId: "company-1" } };
    const startRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    routes["/oauth/meta/start"]?.(startReq, startRes);
    // Extract state from redirect URL
    const redirectCall = startRes.redirect.mock.calls[0][0] as string;
    const state = new URL(redirectCall).searchParams.get("state")!;

    // Mock fetch responses
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "short_tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "long_tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "act_123" }] }) });

    const callbackReq = { query: { code: "CODE", state } };
    const callbackRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes["/oauth/meta/callback"]?.(callbackReq, callbackRes);

    expect(saved["marketing-ai/meta/access_token"]).toBe("short_tok");
    expect(saved["marketing-ai/meta/long_lived_token"]).toBe("long_tok");
    expect(saved["marketing-ai/meta/ad_account_id"]).toBe("act_123");
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/tests/meta-oauth.test.ts
git commit -m "test(marketing-ai): Meta OAuth mock token exchange test"
```

---

## Phase C1.3 — Google Ads OAuth

### Task 7: Google Ads OAuth flow

**Files:**
- Create: `packages/plugins/marketing-ai/server-routes/google-oauth.ts`

Identyczny wzorzec jak Meta, scope: `https://www.googleapis.com/auth/adwords`.

- [ ] **Step 1: google-oauth.ts**

```ts
import { randomBytes } from "node:crypto";
import type { Router, Request, Response } from "express";

const pendingStates = new Map<string, { companyId: string; expiresAt: number }>();

export function registerGoogleOAuthRoutes(router: Router, deps: {
  getClientId: () => string;
  getClientSecret: () => string;
  getDeveloperToken: () => string;
  saveSecret: (companyId: string, key: string, value: string) => Promise<void>;
}): void {
  const REDIRECT_URI = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/api/plugins/marketing-ai/oauth/google/callback`
    : "http://localhost:3100/api/plugins/marketing-ai/oauth/google/callback";

  router.get("/oauth/google/start", (req: Request, res: Response) => {
    const companyId = req.query["companyId"] as string | undefined;
    if (!companyId) { res.status(400).json({ error: "companyId required" }); return; }

    const state = randomBytes(32).toString("hex");
    pendingStates.set(state, { companyId, expiresAt: Date.now() + 10 * 60_000 });

    const params = new URLSearchParams({
      client_id: deps.getClientId(),
      redirect_uri: REDIRECT_URI,
      scope: "https://www.googleapis.com/auth/adwords",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get("/oauth/google/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) { res.status(400).json({ error }); return; }

    const pending = state ? pendingStates.get(state) : undefined;
    if (!pending || pending.expiresAt < Date.now()) {
      res.status(400).json({ error: "Invalid or expired OAuth state" });
      return;
    }
    pendingStates.delete(state);
    const { companyId } = pending;

    // Exchange auth code for refresh token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: deps.getClientId(),
        client_secret: deps.getClientSecret(),
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) { res.status(502).json({ error: "Google token exchange failed" }); return; }

    const tokenJson = await tokenRes.json() as { refresh_token?: string };
    const refreshToken = tokenJson.refresh_token ?? "";

    // Customer ID: user provides in query OR we fetch from API in later iteration
    const customerId = (req.query["customerId"] as string | undefined) ?? "";

    await Promise.all([
      deps.saveSecret(companyId, "marketing-ai/google/refresh_token", refreshToken),
      deps.saveSecret(companyId, "marketing-ai/google/customer_id", customerId),
      deps.saveSecret(companyId, "marketing-ai/google/developer_token", deps.getDeveloperToken()),
    ]);

    res.redirect("/settings/plugins/marketing-ai?google=connected");
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/server-routes/google-oauth.ts
git commit -m "feat(marketing-ai): Google Ads OAuth flow — start + callback endpoints"
```

---

### Task 8: Settings UI — Google connect button

**Files:**
- Modify: `packages/plugins/marketing-ai/src/ui/SettingsPage.tsx`

- [ ] **Step 1: Podmień placeholder Google na prawdziwy przycisk**

Zastąp sekcję Google Ads w `SettingsPage.tsx`:
```tsx
const [googleStatus] = useState<"connected" | "disconnected">(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get("google") === "connected" ? "connected" : "disconnected";
});

function handleConnectGoogle() {
  const url = `/api/plugins/marketing-ai/oauth/google/start?companyId=${companyId}`;
  window.location.href = url;
}
```

I podmień sekcję `<section>` dla Google na:
```tsx
<section className="space-y-2">
  <h3 className="font-medium">Google Ads</h3>
  {googleStatus === "connected" ? (
    <p className="text-sm text-green-500">Connected</p>
  ) : (
    <p className="text-sm text-muted-foreground">Not connected</p>
  )}
  <button
    type="button"
    onClick={handleConnectGoogle}
    className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
  >
    {googleStatus === "connected" ? "Reconnect Google" : "Connect Google"}
  </button>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/ui/SettingsPage.tsx
git commit -m "feat(marketing-ai): add Google connect button to settings UI"
```

---

### Task 9: Test Google OAuth (mock)

**Files:**
- Create: `packages/plugins/marketing-ai/tests/google-oauth.test.ts`

- [ ] **Step 1: test**

```ts
import { describe, it, expect, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { registerGoogleOAuthRoutes } = await import("../server-routes/google-oauth.js");

describe("Google OAuth — registerGoogleOAuthRoutes", () => {
  it("saves refresh_token and developer_token on successful callback", async () => {
    const saved: Record<string, string> = {};
    const routes: Record<string, (req: unknown, res: unknown) => void> = {};
    const router = {
      get: (path: string, h: (req: unknown, res: unknown) => void) => { routes[path] = h; },
    };

    registerGoogleOAuthRoutes(router as never, {
      getClientId: () => "CID",
      getClientSecret: () => "CSECRET",
      getDeveloperToken: () => "DEV_TOKEN",
      saveSecret: async (_, key, value) => { saved[key] = value; },
    });

    const startReq = { query: { companyId: "company-1" } };
    const startRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    routes["/oauth/google/start"]?.(startReq, startRes);
    const redirectUrl = startRes.redirect.mock.calls[0][0] as string;
    const state = new URL(redirectUrl).searchParams.get("state")!;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ refresh_token: "rt_abc123", access_token: "at_xyz" }),
    });

    const callbackReq = { query: { code: "AUTH_CODE", state, customerId: "123-456-7890" } };
    const callbackRes = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes["/oauth/google/callback"]?.(callbackReq, callbackRes);

    expect(saved["marketing-ai/google/refresh_token"]).toBe("rt_abc123");
    expect(saved["marketing-ai/google/developer_token"]).toBe("DEV_TOKEN");
    expect(saved["marketing-ai/google/customer_id"]).toBe("123-456-7890");
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/tests/google-oauth.test.ts
git commit -m "test(marketing-ai): Google OAuth mock token exchange test"
```

---

## Phase C1.4 — Meta + Google Adapters

### Task 10: Meta Ads client wrapper

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/meta-ads/client.ts`

- [ ] **Step 1: client.ts**

```ts
// Thin wrapper around facebook-nodejs-business-sdk.
// Tokens loaded from secrets at call time — never cached in module scope.
import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";

export interface MetaSecrets {
  accessToken: string;
  adAccountId: string;
}

export function initMetaClient(secrets: MetaSecrets): AdAccount {
  FacebookAdsApi.init(secrets.accessToken);
  // Normalize: facebook SDK expects "act_<id>" prefix
  const accountId = secrets.adAccountId.startsWith("act_")
    ? secrets.adAccountId
    : `act_${secrets.adAccountId}`;
  return new AdAccount(accountId);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/meta-ads/client.ts
git commit -m "feat(marketing-ai): Meta Ads client wrapper"
```

---

### Task 11: Meta campaigns adapter

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/meta-ads/campaigns.ts`

- [ ] **Step 1: campaigns.ts**

```ts
import type { AdAccount } from "facebook-nodejs-business-sdk";
import { Campaign } from "facebook-nodejs-business-sdk";

export interface CampaignSpec {
  name: string;
  objective: string; // e.g. "OUTCOME_SALES" | "OUTCOME_AWARENESS"
  dailyBudgetCents: number; // in account currency smallest unit
  startTime?: string; // ISO 8601
  stopTime?: string;
}

export interface CampaignResult {
  id: string;
  name: string;
  status: string;
}

export async function createCampaign(
  account: AdAccount,
  spec: CampaignSpec,
): Promise<CampaignResult> {
  const fields: string[] = [];
  const params = {
    [Campaign.Fields.name]: spec.name,
    [Campaign.Fields.objective]: spec.objective,
    [Campaign.Fields.status]: Campaign.Status.paused, // start paused, activate after approval
    [Campaign.Fields.daily_budget]: String(spec.dailyBudgetCents),
    ...(spec.startTime ? { [Campaign.Fields.start_time]: spec.startTime } : {}),
    ...(spec.stopTime ? { [Campaign.Fields.stop_time]: spec.stopTime } : {}),
    special_ad_categories: [],
  };
  const result = await account.createCampaign(fields, params) as { id: string };
  return { id: result.id, name: spec.name, status: "PAUSED" };
}

export async function pauseCampaign(campaignId: string, accessToken: string): Promise<void> {
  const campaign = new Campaign(campaignId);
  await campaign.update([Campaign.Fields.status], {
    [Campaign.Fields.status]: Campaign.Status.paused,
    access_token: accessToken,
  } as unknown as Record<string, unknown>);
}

export async function getCampaign(
  campaignId: string,
  accessToken: string,
): Promise<CampaignResult> {
  const campaign = new Campaign(campaignId);
  const result = await campaign.get([
    Campaign.Fields.id,
    Campaign.Fields.name,
    Campaign.Fields.status,
  ], { access_token: accessToken }) as CampaignResult;
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/meta-ads/campaigns.ts
git commit -m "feat(marketing-ai): Meta campaigns adapter (create/pause/get)"
```

---

### Task 12: Meta insights adapter

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/meta-ads/insights.ts`

- [ ] **Step 1: insights.ts**

```ts
import type { AdAccount } from "facebook-nodejs-business-sdk";
import { AdsInsights } from "facebook-nodejs-business-sdk";

export interface InsightsResult {
  spend: number;           // account currency
  impressions: number;
  clicks: number;
  ctr: number;             // 0-100 (%)
  conversions: number;
  conversionValue: number; // account currency
  roas: number;            // conversionValue / spend; 0 if spend=0
}

export async function fetchInsights(
  account: AdAccount,
  campaignId: string,
  since: string,  // "YYYY-MM-DD"
  until: string,
): Promise<InsightsResult> {
  const fields = [
    AdsInsights.Fields.spend,
    AdsInsights.Fields.impressions,
    AdsInsights.Fields.clicks,
    AdsInsights.Fields.ctr,
    AdsInsights.Fields.actions,
    AdsInsights.Fields.action_values,
  ];
  const params = {
    time_range: { since, until },
    filtering: [{ field: "campaign.id", operator: "EQUAL", value: campaignId }],
    level: "campaign",
  };

  const cursor = await account.getInsights(fields, params);
  const rows = await cursor.next() as Array<Record<string, string>>;
  const row = rows[0];
  if (!row) return { spend: 0, impressions: 0, clicks: 0, ctr: 0, conversions: 0, conversionValue: 0, roas: 0 };

  const spend = parseFloat(row.spend ?? "0");
  const impressions = parseInt(row.impressions ?? "0", 10);
  const clicks = parseInt(row.clicks ?? "0", 10);
  const ctr = parseFloat(row.ctr ?? "0");

  // Sum "purchase" action value for ROAS
  const actionValues = (row.action_values ?? []) as Array<{ action_type: string; value: string }>;
  const conversionValue = actionValues
    .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase")
    .reduce((sum, a) => sum + parseFloat(a.value ?? "0"), 0);
  const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>;
  const conversions = actions
    .filter((a) => a.action_type === "offsite_conversion.fb_pixel_purchase")
    .reduce((sum, a) => sum + parseInt(a.value ?? "0", 10), 0);

  const roas = spend > 0 ? conversionValue / spend : 0;
  return { spend, impressions, clicks, ctr, conversions, conversionValue, roas };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/meta-ads/insights.ts
git commit -m "feat(marketing-ai): Meta insights adapter (spend/impressions/clicks/ROAS)"
```

---

### Task 13: Google Ads client wrapper

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/google-ads/client.ts`

- [ ] **Step 1: client.ts**

```ts
import { GoogleAdsApi, type Customer } from "google-ads-api";

export interface GoogleSecrets {
  developerToken: string;
  clientId: string;         // from env, not secrets store
  clientSecret: string;     // from env
  refreshToken: string;
  customerId: string;       // "123-456-7890" or "1234567890"
}

export function initGoogleClient(secrets: GoogleSecrets): Customer {
  const client = new GoogleAdsApi({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    developer_token: secrets.developerToken,
  });
  const normalizedId = secrets.customerId.replace(/-/g, "");
  return client.Customer({
    customer_id: normalizedId,
    refresh_token: secrets.refreshToken,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/google-ads/client.ts
git commit -m "feat(marketing-ai): Google Ads client wrapper"
```

---

### Task 14: Google Ads campaigns adapter

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/google-ads/campaigns.ts`

- [ ] **Step 1: campaigns.ts**

```ts
import type { Customer } from "google-ads-api";
import { enums } from "google-ads-api";

export interface GoogleCampaignSpec {
  name: string;
  budgetAmountMicros: number; // daily budget in micros (1 PLN = 1_000_000 micros)
  advertisingChannelType?: string; // default SEARCH
}

export interface GoogleCampaignResult {
  id: string;
  name: string;
  status: string;
  budgetId: string;
}

export async function createCampaign(
  customer: Customer,
  spec: GoogleCampaignSpec,
): Promise<GoogleCampaignResult> {
  // 1. Create campaign budget
  const budgetResult = await customer.campaignBudgets.create([{
    name: `${spec.name} Budget`,
    amount_micros: spec.budgetAmountMicros,
    delivery_method: enums.BudgetDeliveryMethod.STANDARD,
  }]);
  const budgetId = String(budgetResult.results[0]?.resource_name ?? "");

  // 2. Create campaign (paused — activated on approval)
  const campaignResult = await customer.campaigns.create([{
    name: spec.name,
    status: enums.CampaignStatus.PAUSED,
    advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
    campaign_budget: budgetId,
    manual_cpc: { enhanced_cpc_enabled: false },
  }]);
  const campaignResourceName = campaignResult.results[0]?.resource_name ?? "";
  const id = campaignResourceName.split("/").pop() ?? "";

  return { id, name: spec.name, status: "PAUSED", budgetId };
}

export async function pauseCampaign(customer: Customer, campaignId: string): Promise<void> {
  await customer.campaigns.update([{
    resource_name: `customers/${(customer as unknown as { customer_id: string }).customer_id}/campaigns/${campaignId}`,
    status: enums.CampaignStatus.PAUSED,
  }]);
}

export async function getCampaign(
  customer: Customer,
  campaignId: string,
): Promise<GoogleCampaignResult> {
  const [row] = await customer.query(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.campaign_budget
     FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`
  );
  const c = row?.campaign;
  return {
    id: String(c?.id ?? campaignId),
    name: String(c?.name ?? ""),
    status: String(c?.status ?? ""),
    budgetId: String(c?.campaign_budget ?? ""),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/google-ads/campaigns.ts
git commit -m "feat(marketing-ai): Google Ads campaigns adapter (create/pause/get)"
```

---

### Task 15: Google Ads metrics + NBP helper

**Files:**
- Create: `packages/plugins/marketing-ai/src/adapters/google-ads/metrics.ts`
- Create: `packages/plugins/marketing-ai/src/adapters/nbp.ts`

- [ ] **Step 1: metrics.ts**

```ts
import type { Customer } from "google-ads-api";

export interface GoogleMetricsResult {
  spend: number;         // account currency (usually USD)
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionValue: number;
  roas: number;
}

export async function fetchMetrics(
  customer: Customer,
  campaignId: string,
  since: string,  // "YYYY-MM-DD"
  until: string,
): Promise<GoogleMetricsResult> {
  const rows = await customer.query(
    `SELECT
       metrics.cost_micros,
       metrics.impressions,
       metrics.clicks,
       metrics.ctr,
       metrics.conversions,
       metrics.conversions_value
     FROM campaign
     WHERE campaign.id = ${campaignId}
       AND segments.date BETWEEN '${since}' AND '${until}'`
  );

  let costMicros = 0, impressions = 0, clicks = 0, conversions = 0, conversionValue = 0;
  for (const row of rows) {
    const m = row.metrics;
    if (!m) continue;
    costMicros += Number(m.cost_micros ?? 0);
    impressions += Number(m.impressions ?? 0);
    clicks += Number(m.clicks ?? 0);
    conversions += Number(m.conversions ?? 0);
    conversionValue += Number(m.conversions_value ?? 0);
  }

  const spend = costMicros / 1_000_000;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;
  return { spend, impressions, clicks, ctr, conversions, conversionValue, roas };
}
```

- [ ] **Step 2: nbp.ts (PLN conversion helper)**

```ts
// Fetches mid-rate for a given currency from NBP open API.
// Used for unified PLN reporting in marketing.fetch_metrics tool.
// Cache: 1h in-process (acceptable for daily reporting).

const cache = new Map<string, { rate: number; expiresAt: number }>();

export async function getPlnRate(currencyCode: string): Promise<number> {
  if (currencyCode.toUpperCase() === "PLN") return 1;

  const key = currencyCode.toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${key}/?format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NBP rate fetch failed for ${key}: ${res.status}`);

  const json = await res.json() as { rates: Array<{ mid: number }> };
  const rate = json.rates[0]?.mid;
  if (!rate) throw new Error(`No NBP rate for ${key}`);

  cache.set(key, { rate, expiresAt: Date.now() + 60 * 60_000 });
  return rate;
}

export async function convertToPln(amount: number, fromCurrency: string): Promise<number> {
  const rate = await getPlnRate(fromCurrency);
  return amount * rate;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/marketing-ai/src/adapters/google-ads/metrics.ts packages/plugins/marketing-ai/src/adapters/nbp.ts
git commit -m "feat(marketing-ai): Google metrics adapter + NBP PLN conversion helper"
```

---

## Phase C1.5 — Tests + Setup

### Task 16: Adapter mock tests

**Files:**
- Create: `packages/plugins/marketing-ai/tests/meta-adapter.test.ts`
- Create: `packages/plugins/marketing-ai/tests/google-adapter.test.ts`

- [ ] **Step 1: meta-adapter.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchInsights } from "../src/adapters/meta-ads/insights.js";

describe("Meta fetchInsights", () => {
  it("returns zero result when no rows returned", async () => {
    const mockAccount = {
      getInsights: vi.fn().mockResolvedValue({
        next: vi.fn().mockResolvedValue([]),
      }),
    };

    const result = await fetchInsights(mockAccount as never, "123", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(0);
    expect(result.roas).toBe(0);
    expect(result.impressions).toBe(0);
  });

  it("computes ROAS correctly from row data", async () => {
    const row = {
      spend: "100.00",
      impressions: "5000",
      clicks: "200",
      ctr: "4.0",
      actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "10" }],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "350.00" }],
    };
    const mockAccount = {
      getInsights: vi.fn().mockResolvedValue({
        next: vi.fn().mockResolvedValue([row]),
      }),
    };

    const result = await fetchInsights(mockAccount as never, "123", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(100);
    expect(result.conversions).toBe(10);
    expect(result.conversionValue).toBe(350);
    expect(result.roas).toBeCloseTo(3.5);
  });
});
```

- [ ] **Step 2: google-adapter.test.ts**

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchMetrics } from "../src/adapters/google-ads/metrics.js";

describe("Google fetchMetrics", () => {
  it("returns zeroed result for empty rows", async () => {
    const mockCustomer = { query: vi.fn().mockResolvedValue([]) };
    const result = await fetchMetrics(mockCustomer as never, "456", "2026-01-01", "2026-01-31");
    expect(result.spend).toBe(0);
    expect(result.roas).toBe(0);
  });

  it("aggregates multiple daily rows", async () => {
    const rows = [
      { metrics: { cost_micros: 5_000_000, impressions: 1000, clicks: 50, conversions: 5, conversions_value: 100 } },
      { metrics: { cost_micros: 3_000_000, impressions: 800, clicks: 30, conversions: 3, conversions_value: 60 } },
    ];
    const mockCustomer = { query: vi.fn().mockResolvedValue(rows) };
    const result = await fetchMetrics(mockCustomer as never, "456", "2026-01-01", "2026-01-31");
    expect(result.spend).toBeCloseTo(8);
    expect(result.conversions).toBe(8);
    expect(result.conversionValue).toBe(160);
    expect(result.roas).toBeCloseTo(20);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/marketing-ai/tests/
git commit -m "test(marketing-ai): Meta + Google adapter mock tests"
```

---

### Task 17: README — OAuth setup

**Files:**
- Create: `packages/plugins/marketing-ai/README.md`

- [ ] **Step 1: README.md**

```markdown
# @paperclipai/plugin-marketing-ai

Marketing AI plugin for Paperclip. Agent-driven Meta Ads + Google Ads campaigns with AI creative generation and human-in-the-loop approval.

## OAuth setup — required before use

### Meta

1. Utwórz aplikację w Meta for Developers (`https://developers.facebook.com/`).
2. Dodaj produkt **Marketing API** do aplikacji.
3. W "App Settings → Basic" skopiuj **App ID** i **App Secret**.
4. Dodaj URI callbacku: `http://localhost:3100/api/plugins/marketing-ai/oauth/meta/callback` (lub produkcyjny URL).
5. Ustaw zmienne środowiskowe serwera:
   ```
   META_APP_ID=<App ID>
   META_APP_SECRET=<App Secret>
   ```
6. Połącz konto: Settings → Plugins → Marketing AI → "Connect Meta".

### Google Ads

1. Utwórz projekt w Google Cloud Console i włącz **Google Ads API**.
2. Utwórz OAuth 2.0 Client ID (typ: Web application).
3. Dodaj URI callbacku: `http://localhost:3100/api/plugins/marketing-ai/oauth/google/callback`.
4. Uzyskaj **Developer Token** w Google Ads (Manager Account → API Center).
5. Ustaw zmienne środowiskowe:
   ```
   GOOGLE_ADS_CLIENT_ID=<OAuth Client ID>
   GOOGLE_ADS_CLIENT_SECRET=<OAuth Client Secret>
   GOOGLE_ADS_DEVELOPER_TOKEN=<Developer Token>
   ```
6. Połącz konto: Settings → Plugins → Marketing AI → "Connect Google".

### Sekrety

Tokeny OAuth są szyfrowane i zapisywane w tabeli `company_secrets` przez istniejący secrets store Paperclipa (`local-encrypted-provider`). Nigdy nie trafiają do logów ani do kodu źródłowego.

## Development

```bash
pnpm --filter @paperclipai/plugin-marketing-ai test
pnpm --filter @paperclipai/plugin-marketing-ai typecheck
```

## Plan implementacji

- **C1** (ten branch): scaffold + OAuth + adaptery — `docs/superpowers/plans/2026-05-24-broadcast-c1-foundation.md`
- **C2** (następny): creative pipeline, tools, DB tables, approval flow, UI views — `docs/superpowers/plans/2026-05-24-broadcast-c2-product.md`
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/marketing-ai/README.md
git commit -m "docs(marketing-ai): README with OAuth setup instructions"
```

---

## Podsumowanie C1

| Faza | Zadania | Deliverable |
|------|---------|-------------|
| C1.1 Scaffold | T1–T3 | Pakiet zarejestrowany w workspace, manifest, vitest |
| C1.2 Meta OAuth | T4–T6 | OAuth flow Meta end-to-end, Settings UI (Meta), test |
| C1.3 Google OAuth | T7–T9 | OAuth flow Google end-to-end, Settings UI (Google), test |
| C1.4 Adapters | T10–T15 | Meta + Google CRUD + metrics, NBP helper |
| C1.5 Tests + README | T16–T17 | Adapter mock tests, developer docs |

**Total: 17 tasks.**

---

This plan covers Phase C1 (foundation). The remaining work — creative pipeline, tools registration, DB tables, approval flow, UI views — is in `docs/superpowers/plans/2026-05-24-broadcast-c2-product.md` (Faza C2).
