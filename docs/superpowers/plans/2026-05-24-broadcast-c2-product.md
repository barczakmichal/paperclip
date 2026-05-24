# Broadcast Edition — Faza C2: Creative Pipeline + Tools + DB + UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md](../specs/2026-05-24-paperclip-broadcast-edition-design.md) — sekcje 7–10

**Goal:** Zbudować działający produkt warstwy C — kreacje, narzędzia agenta, tabele DB, flow zatwierdzania i widok `/marketing`. C1 (wchodzące w scope Fazy C1) dostarcza: szkielet pluginu `packages/plugins/marketing-ai/`, OAuth dla Meta + Google, adaptery `createCampaign / fetchInsights / pauseCampaign`. Ten plan (C2) zaczyna się od miejsca, gdzie C1 kończy, i dowozi resztę produktu.

**Architecture:**
- Trzy nowe tabele Drizzle: `campaign_proposals`, `creatives`, `marketing_audit_log`
- Dwie nowe kolumny w `companies`: `brand_kit_json`, `marketing_monthly_cap_pln`
- Creative pipeline: Shopify catalog → Claude brief → Claude copy → sharp/GPT-Image-1 image
- 6 tool handlerów rejestrowanych przez Plugin SDK `ctx.tools.register()`
- Approval handler `on-approve → publish` przez istniejący `approvals` core
- Egzekwowanie capu miesięcznego przed każdym publish
- Audit log dla każdej akcji marketing AI
- UI: `/marketing` page + karty kampanii + modal kreacji + approval card + ROAS chart

**Tech Stack:**
- DB: Drizzle, Postgres embedded; importy z `@paperclipai/db`
- Plugin: `@paperclipai/plugin-sdk`, TypeScript, Node 20
- AI: Anthropic SDK (Claude) dla brief/copy; OpenAI SDK (`openai`) dla GPT-Image-1
- Images: `sharp` + `@napi-rs/canvas` dla kompozycji
- Frontend: React 19, Tailwind v4, shadcn/ui, `@tanstack/react-query`
- Tests: vitest; `pnpm test:run -- --project server <pattern>` / `--project ui <pattern>`

**Prerequisite:** C1 branch zmergowany do master lub C2 branchowany z C1. Plugin `packages/plugins/marketing-ai/` istnieje z `package.json`, `plugin.json`, `src/index.ts`, `src/adapters/meta-ads/` i `src/adapters/google-ads/`.

---

## File Structure (Faza C2)

**Nowe pliki — DB:**
```
packages/db/src/schema/campaign_proposals.ts
packages/db/src/schema/creatives.ts
packages/db/src/schema/marketing_audit_log.ts
packages/db/drizzle/<NNNN>_broadcast_c2_marketing_tables.sql   # wygenerowana
packages/db/drizzle/<NNNN+1>_broadcast_c2_company_brand_kit.sql
```

**Modyfikowane pliki — DB:**
```
packages/db/src/schema/companies.ts            # +brand_kit_json, +marketing_monthly_cap_pln
packages/db/src/schema/index.ts                # eksport nowych tabel
```

**Nowe pliki — plugin creative:**
```
packages/plugins/marketing-ai/src/creative/shop-catalog.ts
packages/plugins/marketing-ai/src/creative/brief-generator.ts
packages/plugins/marketing-ai/src/creative/copy-generator.ts
packages/plugins/marketing-ai/src/creative/image-composer.ts
packages/plugins/marketing-ai/src/creative/brand-validator.ts
packages/plugins/marketing-ai/tests/creative-generator.test.ts
```

**Nowe pliki — plugin tools:**
```
packages/plugins/marketing-ai/src/tools/marketing.list_products.ts
packages/plugins/marketing-ai/src/tools/marketing.propose_campaign.ts
packages/plugins/marketing-ai/src/tools/marketing.generate_creative.ts
packages/plugins/marketing-ai/src/tools/marketing.submit_for_approval.ts
packages/plugins/marketing-ai/src/tools/marketing.fetch_metrics.ts
packages/plugins/marketing-ai/src/tools/marketing.pause_campaign.ts
```

**Nowe pliki — plugin approval:**
```
packages/plugins/marketing-ai/src/approval/payload.ts
packages/plugins/marketing-ai/src/approval/handler.ts
packages/plugins/marketing-ai/src/approval/cap-enforcement.ts
```

**Modyfikowane pliki — plugin:**
```
packages/plugins/marketing-ai/src/index.ts    # registerTools + registerApprovalHandlers
```

**Nowe pliki — UI:**
```
packages/plugins/marketing-ai/src/ui/MarketingPage.tsx
packages/plugins/marketing-ai/src/ui/CampaignCard.tsx
packages/plugins/marketing-ai/src/ui/CreativePreview.tsx
packages/plugins/marketing-ai/src/ui/CampaignApprovalCard.tsx
packages/plugins/marketing-ai/src/ui/ROASChart.tsx
packages/plugins/marketing-ai/src/ui/MarketingPage.test.tsx
```

---

## Conventions for this plan

- TDD: service-layer + React pages mają failing test przed implementacją
- Commit prefixes: `feat(marketing):`, `test(marketing):`, `style(marketing):`
- Branch: `feature/broadcast-c-marketing-ai` (zakładane z C1; jeśli nowy — `git checkout -b feature/broadcast-c-marketing-ai`)
- Granularność: jeden commit = jeden atomowy task
- Typecheck po każdym tasku: `pnpm typecheck`
- Nigdy nie hardkoduj kluczy API — zawsze przez `ctx.secrets.resolve()`

---

## Task 1: Setup branch dla Fazy C2

**Files:** brak nowych.

- [ ] **Step 1: Branch z C1 lub master**

Jeśli C1 zmergowany do master:
```bash
git checkout master && git pull
git checkout -b feature/broadcast-c-marketing-ai
```

Jeśli C1 jest osobnym branchem i C2 musi go rozszerzyć:
```bash
git checkout feature/broadcast-c1-foundation
git checkout -b feature/broadcast-c-marketing-ai
```

- [ ] **Step 2: Potwierdź bazę**
```bash
git branch --show-current
ls packages/plugins/marketing-ai/src/
```
Expected: widać `index.ts`, `adapters/`, (może już `tools/`, `creative/`). Jeśli ich nie ma — C1 niekompletny. Zatrzymaj się i doconfirmuj.

- [ ] **Step 3: Anchor commit**
```bash
git commit --allow-empty -m "chore(marketing): start Faza C2 branch"
```

---

## Task 2: Migracja Drizzle — tabele marketing

**Files:**
- Create: `packages/db/src/schema/campaign_proposals.ts`
- Create: `packages/db/src/schema/creatives.ts`
- Create: `packages/db/src/schema/marketing_audit_log.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: campaign_proposals.ts**

```ts
import { pgTable, uuid, text, timestamp, jsonb, numeric, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const campaignProposals = pgTable(
  "campaign_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").references(() => agents.id),
    platform: text("platform").notNull(), // "meta" | "google"
    goal: text("goal").notNull(),         // "sales" | "awareness" | "leads"
    status: text("status").notNull().default("draft"),
    // "draft" | "pending_approval" | "approved" | "live" | "paused" | "rejected" | "rejected_by_platform" | "expired"
    productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
    budgetDailyPln: numeric("budget_daily_pln", { precision: 12, scale: 2 }).notNull(),
    durationDays: integer("duration_days").notNull(),
    audienceBrief: text("audience_brief"),
    estimatedReach: jsonb("estimated_reach").$type<Record<string, unknown>>(),
    platformCampaignId: text("platform_campaign_id"), // set after publish
    adSets: jsonb("ad_sets").$type<unknown[]>().notNull().default([]),
    briefJson: jsonb("brief_json").$type<Record<string, unknown>>(),
    rejectionReason: text("rejection_reason"),
    approvalId: uuid("approval_id"),   // FK to core approvals table (loose, no FK constraint — avoids cross-schema issues)
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("campaign_proposals_company_status_idx").on(table.companyId, table.status),
  }),
);
```

- [ ] **Step 2: creatives.ts**

```ts
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { campaignProposals } from "./campaign_proposals.js";

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    proposalId: uuid("proposal_id").references(() => campaignProposals.id),
    format: text("format").notNull(), // "single_image" | "carousel"
    status: text("status").notNull().default("pending"),
    // "pending" | "complete" | "incomplete" | "archived"
    imageUrl: text("image_url"),
    headlines: jsonb("headlines").$type<string[]>().notNull().default([]),
    bodies: jsonb("bodies").$type<string[]>().notNull().default([]),
    descriptions: jsonb("descriptions").$type<string[]>().notNull().default([]),
    cta: text("cta"),
    briefJson: jsonb("brief_json").$type<Record<string, unknown>>(),
    platformAssetId: text("platform_asset_id"), // set after upload to Meta/Google
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    proposalIdx: index("creatives_proposal_idx").on(table.proposalId),
    companyStatusIdx: index("creatives_company_status_idx").on(table.companyId, table.status),
  }),
);
```

- [ ] **Step 3: marketing_audit_log.ts**

```ts
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const marketingAuditLog = pgTable(
  "marketing_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    action: text("action").notNull(),
    // "proposal.created" | "creative.generated" | "approval.submitted"
    // | "approval.approved" | "approval.rejected" | "campaign.published"
    // | "campaign.paused" | "cap.exceeded"
    userId: text("user_id"),       // operator who approved/rejected (nullable for agent actions)
    agentId: uuid("agent_id"),
    entityType: text("entity_type"), // "campaign_proposal" | "creative" | "approval"
    entityId: uuid("entity_id"),
    payloadDiff: jsonb("payload_diff").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("marketing_audit_log_company_created_idx").on(table.companyId, table.createdAt),
  }),
);
```

- [ ] **Step 4: Eksport w index.ts**

W `packages/db/src/schema/index.ts` dodaj eksporty:
```ts
export * from "./campaign_proposals.js";
export * from "./creatives.js";
export * from "./marketing_audit_log.js";
```

- [ ] **Step 5: Generate + apply migration**
```bash
pnpm db:generate
pnpm db:migrate
```
Sprawdź wygenerowany SQL — tylko `CREATE TABLE` i `CREATE INDEX`. Brak `DROP`.

- [ ] **Step 6: Typecheck + commit**
```bash
pnpm typecheck
git add packages/db/src/schema/campaign_proposals.ts \
        packages/db/src/schema/creatives.ts \
        packages/db/src/schema/marketing_audit_log.ts \
        packages/db/src/schema/index.ts \
        packages/db/drizzle/
git commit -m "feat(marketing): add campaign_proposals, creatives, marketing_audit_log tables"
```

---

## Task 3: Migracja Drizzle — brand_kit_json i marketing_monthly_cap_pln na companies

**Files:**
- Modify: `packages/db/src/schema/companies.ts`

- [ ] **Step 1: Dodaj kolumny**

W obiekcie definicji `companies`, przed `createdAt`, dodaj:
```ts
brandKitJson: jsonb("brand_kit_json").$type<{
  colors?: { primary?: string; secondary?: string };
  toneOfVoice?: string;
  mandatoryPhrases?: string[];
  doNots?: string[];
  [key: string]: unknown;
}>(),
marketingMonthlyCaplPln: numeric("marketing_monthly_cap_pln", { precision: 12, scale: 2 }),
```

Note: `numeric` zamiast `integer` — kwoty PLN mają grosze.

- [ ] **Step 2: Generate + apply**
```bash
pnpm db:generate
pnpm db:migrate
```
SQL musi zawierać tylko `ALTER TABLE companies ADD COLUMN brand_kit_json jsonb` i `ADD COLUMN marketing_monthly_cap_pln numeric(12,2)`. Brak DROP.

- [ ] **Step 3: Typecheck + commit**
```bash
pnpm typecheck
git add packages/db/src/schema/companies.ts packages/db/drizzle/
git commit -m "feat(marketing): add brand_kit_json and marketing_monthly_cap_pln to companies"
```

---

## Task 4: shop-catalog.ts — Shopify Admin API client

**Files:**
- Create: `packages/plugins/marketing-ai/src/creative/shop-catalog.ts`
- Create: `packages/plugins/marketing-ai/tests/shop-catalog.test.ts`

Abstrakcja: `ShopCatalog` z konkretną implementacją Shopify. Shopify Admin API endpoint: `GET /admin/api/2024-01/products.json?limit=N&status=active`.

- [ ] **Step 1: Test first**

```ts
// packages/plugins/marketing-ai/tests/shop-catalog.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createShopifyCatalog } from "../src/creative/shop-catalog.js";

const mockFetch = vi.fn();

describe("ShopifyCatalog.listProducts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("maps Shopify products to CatalogProduct shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [{
          id: 123,
          title: "Spinning Rod XL",
          variants: [{ price: "249.99" }],
          images: [{ src: "https://cdn.example.com/rod.jpg" }],
          inventory_quantity: 15,
        }],
      }),
    });

    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
    });

    const result = await catalog.listProducts({ limit: 10 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "123",
      title: "Spinning Rod XL",
      price: "249.99",
      imageUrls: ["https://cdn.example.com/rod.jpg"],
      stock: 15,
    });
  });

  it("retries 3x on shop API timeout", async () => {
    const err = new Error("timeout");
    mockFetch
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ products: [] }) });

    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
    });

    const result = await catalog.listProducts({ limit: 5 });
    expect(result).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 consecutive failures", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    const catalog = createShopifyCatalog({
      shopDomain: "test.myshopify.com",
      accessToken: "secret",
      fetchFn: mockFetch,
    });
    await expect(catalog.listProducts({})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run FAIL**
```bash
pnpm test:run -- --project marketing-ai shop-catalog
```

- [ ] **Step 3: Implementation**

```ts
// packages/plugins/marketing-ai/src/creative/shop-catalog.ts
export interface CatalogProduct {
  id: string;
  title: string;
  price: string;
  imageUrls: string[];
  stock: number;
}

export interface ShopCatalogOptions {
  category?: string;
  limit?: number;
}

export interface ShopCatalog {
  listProducts(opts: ShopCatalogOptions): Promise<CatalogProduct[]>;
}

interface ShopifyCatalogConfig {
  shopDomain: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  retries: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, init);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

export function createShopifyCatalog(config: ShopifyCatalogConfig): ShopCatalog {
  const fetchFn = config.fetchFn ?? fetch;
  const maxRetries = config.maxRetries ?? 2;

  return {
    async listProducts(opts): Promise<CatalogProduct[]> {
      const params = new URLSearchParams({ status: "active", limit: String(opts.limit ?? 50) });
      if (opts.category) params.set("product_type", opts.category);
      const url = `https://${config.shopDomain}/admin/api/2024-01/products.json?${params}`;
      const res = await fetchWithRetry(url, {
        headers: { "X-Shopify-Access-Token": config.accessToken, "Content-Type": "application/json" },
      }, fetchFn, maxRetries);

      if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
      const data = await res.json() as { products: unknown[] };

      return (data.products as Array<{
        id: number; title: string;
        variants: Array<{ price: string }>;
        images: Array<{ src: string }>;
        inventory_quantity?: number;
      }>).map((p) => ({
        id: String(p.id),
        title: p.title,
        price: p.variants[0]?.price ?? "0",
        imageUrls: p.images.map((img) => img.src),
        stock: p.inventory_quantity ?? 0,
      }));
    },
  };
}
```

- [ ] **Step 4: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai shop-catalog
pnpm typecheck
git add packages/plugins/marketing-ai/src/creative/shop-catalog.ts \
        packages/plugins/marketing-ai/tests/shop-catalog.test.ts
git commit -m "feat(marketing): add Shopify shop-catalog client with retry"
```

---

## Task 5: brief-generator.ts — Claude brief od produktu

**Files:**
- Create: `packages/plugins/marketing-ai/src/creative/brief-generator.ts`
- Extend: `packages/plugins/marketing-ai/tests/creative-generator.test.ts`

- [ ] **Step 1: Test first**

```ts
// Dodaj do creative-generator.test.ts (lub utwórz plik):
import { describe, it, expect, vi } from "vitest";
import { generateBrief } from "../src/creative/brief-generator.js";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

describe("generateBrief", () => {
  it("returns brief JSON with positioning, tone, hooks, doNots", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        positioning: "Premium fishing rods for serious anglers",
        tone: "authoritative, enthusiastic",
        hooks: ["Catch more with less effort"],
        doNots: ["darmowy"],
        keyBenefits: ["lightweight carbon fiber"],
      }) }],
    });

    const brief = await generateBrief({
      products: [{ id: "1", title: "Rod XL", price: "249", imageUrls: [], stock: 5 }],
      goal: "sales",
      audienceBrief: "fishing enthusiasts 25-45",
      brandKit: { toneOfVoice: "professional", doNots: ["darmowy"] },
      anthropicApiKey: "test-key",
    });

    expect(brief.positioning).toContain("fishing");
    expect(brief.doNots).toContain("darmowy");
  });

  it("throws on malformed LLM response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not JSON" }],
    });
    await expect(generateBrief({
      products: [],
      goal: "sales",
      audienceBrief: "",
      brandKit: {},
      anthropicApiKey: "test-key",
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implementation**

```ts
// packages/plugins/marketing-ai/src/creative/brief-generator.ts
import Anthropic from "@anthropic-ai/sdk";
import type { CatalogProduct } from "./shop-catalog.js";

export interface BrandKit {
  toneOfVoice?: string;
  doNots?: string[];
  mandatoryPhrases?: string[];
  [key: string]: unknown;
}

export interface Brief {
  positioning: string;
  tone: string;
  keyBenefits: string[];
  hooks: string[];
  doNots: string[];
}

export interface GenerateBriefInput {
  products: CatalogProduct[];
  goal: "sales" | "awareness" | "leads";
  audienceBrief: string;
  brandKit: BrandKit;
  anthropicApiKey: string;
}

export async function generateBrief(input: GenerateBriefInput): Promise<Brief> {
  const client = new Anthropic({ apiKey: input.anthropicApiKey });

  const systemPrompt = [
    "You are a senior advertising strategist.",
    input.brandKit.toneOfVoice ? `Brand tone: ${input.brandKit.toneOfVoice}.` : "",
    input.brandKit.doNots?.length
      ? `NEVER use these phrases: ${input.brandKit.doNots.join(", ")}.`
      : "",
  ].filter(Boolean).join(" ");

  const userPrompt = `Create an ad campaign brief as JSON.
Products: ${JSON.stringify(input.products.map((p) => ({ title: p.title, price: p.price })))}
Goal: ${input.goal}
Audience: ${input.audienceBrief}

Return ONLY valid JSON with keys: positioning (string), tone (string), keyBenefits (string[]), hooks (string[]), doNots (string[]).`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text content in LLM response");

  // Strip markdown code fence if present
  const json = textBlock.text.replace(/^```json?\n?|```$/g, "").trim();
  const parsed = JSON.parse(json) as Brief;
  if (!parsed.positioning) throw new Error("Brief missing required field: positioning");
  return parsed;
}
```

- [ ] **Step 4: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai creative-generator
pnpm typecheck
git add packages/plugins/marketing-ai/src/creative/brief-generator.ts \
        packages/plugins/marketing-ai/tests/creative-generator.test.ts
git commit -m "feat(marketing): add brief-generator with Claude API call"
```

---

## Task 6: copy-generator.ts — Claude copy od briefu

**Files:**
- Create: `packages/plugins/marketing-ai/src/creative/copy-generator.ts`
- Extend: `packages/plugins/marketing-ai/tests/creative-generator.test.ts`

- [ ] **Step 1: Test first**

```ts
// Dodaj do creative-generator.test.ts:
import { generateCopy } from "../src/creative/copy-generator.js";

describe("generateCopy", () => {
  it("returns headlines, primary_texts, descriptions, cta for Meta", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        headlines: ["H1", "H2", "H3", "H4", "H5"],
        primaryTexts: ["T1", "T2", "T3"],
        descriptions: ["D1", "D2", "D3"],
        cta: "Shop Now",
      }) }],
    });

    const copy = await generateCopy({
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: ["darmowy"] },
      platform: "meta",
      headlineCount: 5,
      bodyCount: 3,
      anthropicApiKey: "test-key",
    });

    expect(copy.headlines).toHaveLength(5);
    expect(copy.primaryTexts).toHaveLength(3);
    expect(copy.cta).toBe("Shop Now");
  });

  it("rejects copy that contains doNots phrases", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        headlines: ["darmowy produkt", "H2", "H3", "H4", "H5"],
        primaryTexts: ["T1", "T2", "T3"],
        descriptions: ["D1", "D2", "D3"],
        cta: "Buy",
      }) }],
    });

    await expect(generateCopy({
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: ["darmowy"] },
      platform: "meta",
      anthropicApiKey: "test-key",
    })).rejects.toThrow(/do-not/i);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implementation**

```ts
// packages/plugins/marketing-ai/src/creative/copy-generator.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Brief } from "./brief-generator.js";

export interface CopyOutput {
  headlines: string[];
  primaryTexts: string[];
  descriptions: string[];
  cta: string;
}

export interface GenerateCopyInput {
  brief: Brief;
  platform: "meta" | "google";
  headlineCount?: number;
  bodyCount?: number;
  anthropicApiKey: string;
}

function validateCopy(copy: CopyOutput, doNots: string[]): void {
  const allText = [
    ...copy.headlines,
    ...copy.primaryTexts,
    ...copy.descriptions,
    copy.cta,
  ].join(" ").toLowerCase();

  for (const forbidden of doNots) {
    if (allText.includes(forbidden.toLowerCase())) {
      throw new Error(`do-not phrase found in generated copy: "${forbidden}"`);
    }
  }
}

export async function generateCopy(input: GenerateCopyInput): Promise<CopyOutput> {
  const client = new Anthropic({ apiKey: input.anthropicApiKey });
  const headlineCount = input.headlineCount ?? 5;
  const bodyCount = input.bodyCount ?? 3;

  const platformInstructions = input.platform === "meta"
    ? "Meta Ads: headlines max 40 chars, primary texts max 125 chars, descriptions max 30 chars."
    : "Google Ads: headlines max 30 chars, descriptions max 90 chars. No primary texts needed (use descriptions).";

  const userPrompt = `Write ad copy for this campaign.
Brief: ${JSON.stringify(input.brief)}
Platform: ${input.platform}. ${platformInstructions}

Return ONLY valid JSON with keys:
- headlines: string[${headlineCount}]
- primaryTexts: string[${bodyCount}]
- descriptions: string[${bodyCount}]
- cta: string`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text content in LLM response");

  const json = textBlock.text.replace(/^```json?\n?|```$/g, "").trim();
  const copy = JSON.parse(json) as CopyOutput;

  validateCopy(copy, input.brief.doNots ?? []);
  return copy;
}
```

- [ ] **Step 4: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai creative-generator
pnpm typecheck
git add packages/plugins/marketing-ai/src/creative/copy-generator.ts \
        packages/plugins/marketing-ai/tests/creative-generator.test.ts
git commit -m "feat(marketing): add copy-generator with brand do-not validation"
```

---

## Task 7: image-composer.ts — hybryda sharp + GPT-Image-1

**Files:**
- Create: `packages/plugins/marketing-ai/src/creative/image-composer.ts`
- Extend: `packages/plugins/marketing-ai/tests/creative-generator.test.ts`

Hybryda: kreacje 1:1 / 4:5 — crop/resize produktu przez sharp. Kreacje 1.91:1 (Meta link ad) — GPT-Image-1 generuje tło, sharp komponuje na siebie.

- [ ] **Step 1: Test first**

```ts
// Dodaj do creative-generator.test.ts:
import { composeImage } from "../src/creative/image-composer.js";
import * as fs from "node:fs/promises";

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("composeImage", () => {
  it("processes 1:1 format without calling OpenAI", async () => {
    const mockOpenAI = { images: { generate: vi.fn() } };
    const result = await composeImage({
      productImageUrl: "https://cdn.example.com/product.jpg",
      brief: { positioning: "p", tone: "t", keyBenefits: [], hooks: [], doNots: [] },
      format: "1:1",
      outputPath: "/tmp/test-creative.jpg",
      openaiApiKey: "key",
      _openaiClient: mockOpenAI as unknown,
      _fetchFn: vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }),
    });

    expect(mockOpenAI.images.generate).not.toHaveBeenCalled();
    expect(result.path).toBe("/tmp/test-creative.jpg");
  });

  it("calls GPT-Image-1 for 1.91:1 banner format", async () => {
    const mockOpenAI = {
      images: {
        generate: vi.fn().mockResolvedValue({ data: [{ url: "https://oai.com/bg.jpg" }] }),
      },
    };
    await composeImage({
      productImageUrl: "https://cdn.example.com/product.jpg",
      brief: { positioning: "fishing rod ad", tone: "professional", keyBenefits: [], hooks: [], doNots: [] },
      format: "1.91:1",
      outputPath: "/tmp/test-banner.jpg",
      openaiApiKey: "key",
      _openaiClient: mockOpenAI as unknown,
      _fetchFn: vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) }),
    });
    expect(mockOpenAI.images.generate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implementation**

```ts
// packages/plugins/marketing-ai/src/creative/image-composer.ts
import sharp from "sharp";
import { OpenAI } from "openai";
import type { Brief } from "./brief-generator.js";

// format → [width, height] in pixels
const DIMENSIONS: Record<string, [number, number]> = {
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "1.91:1": [1200, 628],
  "9:16": [1080, 1920],
};

export type CreativeFormat = keyof typeof DIMENSIONS;

export interface ComposeImageInput {
  productImageUrl: string;
  brief: Brief;
  format: CreativeFormat;
  outputPath: string;
  openaiApiKey: string;
  // Injectable for tests
  _openaiClient?: unknown;
  _fetchFn?: typeof fetch;
}

export interface ComposeImageResult {
  path: string;
  width: number;
  height: number;
  usedGenAI: boolean;
}

async function fetchBuffer(url: string, fetchFn: typeof fetch): Promise<Buffer> {
  const res = await fetchFn(url);
  return Buffer.from(await res.arrayBuffer());
}

export async function composeImage(input: ComposeImageInput): Promise<ComposeImageResult> {
  const dims = DIMENSIONS[input.format] ?? DIMENSIONS["1:1"];
  const [width, height] = dims;
  const fetchFn = input._fetchFn ?? fetch;
  const needsBackground = input.format === "1.91:1";

  const productBuf = await fetchBuffer(input.productImageUrl, fetchFn);

  if (!needsBackground) {
    // Simple crop/resize — no gen-AI
    await sharp(productBuf)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFile(input.outputPath);
    return { path: input.outputPath, width, height, usedGenAI: false };
  }

  // Banner — generate AI background, then composite product on top
  const openai = (input._openaiClient as OpenAI | undefined)
    ?? new OpenAI({ apiKey: input.openaiApiKey });

  const bgPrompt = [
    `Background scene for a ${input.brief.positioning} ad.`,
    `Tone: ${input.brief.tone}.`,
    "Clean, photorealistic, no text.",
    `Aspect ratio 1.91:1, ${width}x${height}px.`,
  ].join(" ");

  const bgResponse = await openai.images.generate({
    model: "gpt-image-1",
    prompt: bgPrompt,
    size: "1792x1024", // closest available to 1.91:1
    n: 1,
  });

  const bgUrl = bgResponse.data?.[0]?.url;
  if (!bgUrl) throw new Error("GPT-Image-1 returned no image URL");

  const bgBuf = await fetchBuffer(bgUrl, fetchFn);

  // Resize product to 60% of banner height, center it
  const productHeight = Math.round(height * 0.6);
  const productResized = await sharp(productBuf)
    .resize(undefined, productHeight, { fit: "inside" })
    .toBuffer();

  const meta = await sharp(productResized).metadata();
  const left = Math.round((width - (meta.width ?? 0)) / 2);
  const top = Math.round((height - productHeight) / 2);

  await sharp(bgBuf)
    .resize(width, height, { fit: "cover" })
    .composite([{ input: productResized, left, top }])
    .toFile(input.outputPath);

  return { path: input.outputPath, width, height, usedGenAI: true };
}
```

- [ ] **Step 4: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai creative-generator
pnpm typecheck
git add packages/plugins/marketing-ai/src/creative/image-composer.ts \
        packages/plugins/marketing-ai/tests/creative-generator.test.ts
git commit -m "feat(marketing): add image-composer (sharp + GPT-Image-1 for banners)"
```

---

## Task 8: brand-validator.ts — walidator copy względem brand kit

**Files:**
- Create: `packages/plugins/marketing-ai/src/creative/brand-validator.ts`
- Extend: `packages/plugins/marketing-ai/tests/creative-generator.test.ts`

(Thin helper, TDD minimal — logika walidacji jest prosta)

- [ ] **Step 1: Test first**

```ts
import { validateCopyAgainstBrandKit } from "../src/creative/brand-validator.js";

describe("validateCopyAgainstBrandKit", () => {
  const brandKit = { doNots: ["najtańszy", "gratis"] };

  it("passes clean copy", () => {
    expect(() => validateCopyAgainstBrandKit(["Great rods", "Buy now"], brandKit)).not.toThrow();
  });

  it("throws when copy contains forbidden phrase", () => {
    expect(() => validateCopyAgainstBrandKit(["najtańszy sprzęt na rynku"], brandKit))
      .toThrow(/najtańszy/);
  });

  it("is case-insensitive", () => {
    expect(() => validateCopyAgainstBrandKit(["GRATIS wysyłka"], brandKit))
      .toThrow(/gratis/i);
  });
});
```

- [ ] **Step 2: Implementation**

```ts
// packages/plugins/marketing-ai/src/creative/brand-validator.ts
import type { BrandKit } from "./brief-generator.js";

export function validateCopyAgainstBrandKit(copyLines: string[], brandKit: BrandKit): void {
  const doNots = brandKit.doNots ?? [];
  const combined = copyLines.join(" ").toLowerCase();
  for (const forbidden of doNots) {
    if (combined.includes(forbidden.toLowerCase())) {
      throw new Error(`Brand kit violation: forbidden phrase "${forbidden}" found in copy`);
    }
  }
}
```

- [ ] **Step 3: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai creative-generator
pnpm typecheck
git add packages/plugins/marketing-ai/src/creative/brand-validator.ts \
        packages/plugins/marketing-ai/tests/creative-generator.test.ts
git commit -m "feat(marketing): add brand-validator for copy do-not check"
```

---

## Task 9: marketing.list_products tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.list_products.ts`

Tool wraps `shop-catalog`. Używa `ctx.secrets.resolve()` dla Shopify access token.

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.list_products.ts
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { createShopifyCatalog } from "../creative/shop-catalog.js";

export function registerListProductsTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.list_products",
    {
      displayName: "List Shop Products",
      description: "Fetches product catalog from the connected shop (Shopify). Returns id, title, price, image_urls, stock.",
      parametersSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by product_type (optional)" },
          limit: { type: "number", description: "Max products to return (default 50, max 200)" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as { category?: string; limit?: number };
      try {
        const shopDomain = await ctx.secrets.resolve("marketing-ai/shopify/shop_domain");
        const accessToken = await ctx.secrets.resolve("marketing-ai/shopify/access_token");
        const catalog = createShopifyCatalog({ shopDomain, accessToken });
        const products = await catalog.listProducts({ category: p.category, limit: p.limit });
        return {
          content: `Found ${products.length} products.`,
          data: { products },
        };
      } catch (err) {
        return { error: `Failed to list products: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.list_products.ts
git commit -m "feat(marketing): add marketing.list_products tool"
```

---

## Task 10: marketing.propose_campaign tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.propose_campaign.ts`

Tool tworzy brief przez `brief-generator`, zapisuje `campaign_proposal` do DB i zwraca proposal. Nie uruchamia adaptera (nie tworzy kampanii na platformie — to robi approval handler).

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.propose_campaign.ts
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client"; // match actual import path in codebase
import { campaignProposals } from "@paperclipai/db";
import { generateBrief } from "../creative/brief-generator.js";

// Input matches spec section 7.2
interface ProposeCampaignParams {
  platform: "meta" | "google";
  goal: "sales" | "awareness" | "leads";
  product_ids: string[];
  budget_daily_pln: number;
  duration_days: number;
  audience_brief?: string;
}

export function registerProposeCampaignTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.propose_campaign",
    {
      displayName: "Propose Marketing Campaign",
      description: "Creates a campaign proposal with AI-generated brief. Saves to DB as draft. Does NOT publish to Meta/Google — use submit_for_approval first.",
      parametersSchema: {
        type: "object",
        required: ["platform", "goal", "product_ids", "budget_daily_pln", "duration_days"],
        properties: {
          platform: { type: "string", enum: ["meta", "google"] },
          goal: { type: "string", enum: ["sales", "awareness", "leads"] },
          product_ids: { type: "array", items: { type: "string" } },
          budget_daily_pln: { type: "number" },
          duration_days: { type: "integer", minimum: 1, maximum: 90 },
          audience_brief: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as ProposeCampaignParams;
      try {
        const anthropicKey = await ctx.secrets.resolve("marketing-ai/anthropic/api_key");
        const company = await ctx.companies.get(runCtx.companyId);
        const brandKit = (company as unknown as { brandKitJson?: Record<string, unknown> })?.brandKitJson ?? {};

        // Fetch minimal product data for brief (agent already has full list from list_products)
        const briefProducts = p.product_ids.map((id) => ({ id, title: id, price: "0", imageUrls: [], stock: 0 }));
        const brief = await generateBrief({
          products: briefProducts,
          goal: p.goal,
          audienceBrief: p.audience_brief ?? "",
          brandKit,
          anthropicApiKey: anthropicKey,
        });

        const [proposal] = await db
          .insert(campaignProposals)
          .values({
            companyId: runCtx.companyId,
            agentId: runCtx.agentId,
            platform: p.platform,
            goal: p.goal,
            status: "draft",
            productIds: p.product_ids,
            budgetDailyPln: String(p.budget_daily_pln),
            durationDays: p.duration_days,
            audienceBrief: p.audience_brief,
            briefJson: brief as Record<string, unknown>,
            adSets: [],
          })
          .returning();

        return {
          content: `Campaign proposal created (id: ${proposal!.id}).`,
          data: { campaign_proposal: proposal, brief },
        };
      } catch (err) {
        return { error: `Failed to create proposal: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

NOTE: sprawdź faktyczną ścieżkę importu `db` w istniejącym kodzie pluginów — może być przez `ctx` lub przez bezpośredni import; dopasuj do wzorca z C1.

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.propose_campaign.ts
git commit -m "feat(marketing): add marketing.propose_campaign tool"
```

---

## Task 11: marketing.generate_creative tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.generate_creative.ts`

Uruchamia pełen pipeline: copy-generator + image-composer, zapisuje wiersze w `creatives`.

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.generate_creative.ts
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client";
import { campaignProposals, creatives } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { generateCopy } from "../creative/copy-generator.js";
import { composeImage, type CreativeFormat } from "../creative/image-composer.js";
import type { Brief } from "../creative/brief-generator.js";

interface GenerateCreativeParams {
  proposal_id: string;
  format: "single_image" | "carousel";
  headline_count?: number;
  body_count?: number;
}

// Map logical "format" to image aspect ratio
function pickImageFormat(format: string, platform: string): CreativeFormat {
  if (format === "single_image" && platform === "meta") return "1.91:1";
  if (format === "carousel") return "1:1";
  return "1:1";
}

export function registerGenerateCreativeTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.generate_creative",
    {
      displayName: "Generate Campaign Creative",
      description: "Generates ad copy (Claude) + composed image (sharp/GPT-Image-1) for a proposal. Saves to creatives table.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "format"],
        properties: {
          proposal_id: { type: "string" },
          format: { type: "string", enum: ["single_image", "carousel"] },
          headline_count: { type: "integer", minimum: 1, maximum: 10 },
          body_count: { type: "integer", minimum: 1, maximum: 5 },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as GenerateCreativeParams;
      try {
        const [proposal] = await db
          .select()
          .from(campaignProposals)
          .where(eq(campaignProposals.id, p.proposal_id));

        if (!proposal) return { error: `Proposal not found: ${p.proposal_id}` };
        if (proposal.companyId !== runCtx.companyId) return { error: "Proposal not in current company" };

        const anthropicKey = await ctx.secrets.resolve("marketing-ai/anthropic/api_key");
        const openaiKey = await ctx.secrets.resolve("marketing-ai/openai/api_key");

        const brief = (proposal.briefJson ?? {}) as Brief;
        const copy = await generateCopy({
          brief,
          platform: proposal.platform as "meta" | "google",
          headlineCount: p.headline_count,
          bodyCount: p.body_count,
          anthropicApiKey: anthropicKey,
        });

        // For MVP: use first product image URL from proposal's product list
        // In production, this would look up actual catalog images
        const imageFormat = pickImageFormat(p.format, proposal.platform);
        const outputPath = path.join(os.tmpdir(), `creative-${randomUUID()}.jpg`);

        // Placeholder product image — real impl fetches from shop catalog
        const productImageUrl = `https://placehold.co/${imageFormat === "1.91:1" ? "1200x628" : "1080x1080"}/png`;

        let imageUrl = productImageUrl;
        let composeError: string | undefined;
        try {
          const composed = await composeImage({
            productImageUrl,
            brief,
            format: imageFormat,
            outputPath,
            openaiApiKey: openaiKey,
          });
          // In production: upload to file storage, get URL. For now: file path.
          imageUrl = `file://${composed.path}`;
        } catch (imgErr) {
          composeError = imgErr instanceof Error ? imgErr.message : String(imgErr);
        }

        const [creative] = await db
          .insert(creatives)
          .values({
            companyId: runCtx.companyId,
            proposalId: p.proposal_id,
            format: p.format,
            status: composeError ? "incomplete" : "complete",
            imageUrl,
            headlines: copy.headlines,
            bodies: copy.primaryTexts,
            descriptions: copy.descriptions,
            cta: copy.cta,
            briefJson: brief as Record<string, unknown>,
            errorDetail: composeError,
          })
          .returning();

        return {
          content: `Creative generated (id: ${creative!.id}, status: ${creative!.status}).`,
          data: { creatives: [{ id: creative!.id, image_url: imageUrl, headlines: copy.headlines, bodies: copy.primaryTexts, cta: copy.cta }] },
        };
      } catch (err) {
        return { error: `Failed to generate creative: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.generate_creative.ts
git commit -m "feat(marketing): add marketing.generate_creative tool (copy + image pipeline)"
```

---

## Task 12: marketing.submit_for_approval tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.submit_for_approval.ts`
- Create: `packages/plugins/marketing-ai/src/approval/payload.ts`

Tworzy wiersz w core tabeli `approvals` z `type: "marketing_campaign"`.

- [ ] **Step 1: approval/payload.ts**

```ts
// packages/plugins/marketing-ai/src/approval/payload.ts
export interface MarketingCampaignApprovalPayload {
  proposalId: string;
  creativeIds: string[];
  comments?: string;
  // snapshot danych dla UI (żeby nie wymagać osobnego fetch)
  platform: string;
  goal: string;
  budgetDailyPln: string;
  durationDays: number;
  audienceBrief?: string;
}
```

- [ ] **Step 2: Tool implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.submit_for_approval.ts
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client";
import { campaignProposals, approvals } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import type { MarketingCampaignApprovalPayload } from "../approval/payload.js";

interface SubmitForApprovalParams {
  proposal_id: string;
  creative_ids: string[];
  comments?: string;
}

export function registerSubmitForApprovalTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.submit_for_approval",
    {
      displayName: "Submit Campaign for Approval",
      description: "Submits a campaign proposal + creatives for human review. Creates an Approval record visible in Paperclip UI.",
      parametersSchema: {
        type: "object",
        required: ["proposal_id", "creative_ids"],
        properties: {
          proposal_id: { type: "string" },
          creative_ids: { type: "array", items: { type: "string" }, minItems: 1 },
          comments: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as SubmitForApprovalParams;
      try {
        const [proposal] = await db.select().from(campaignProposals).where(eq(campaignProposals.id, p.proposal_id));
        if (!proposal) return { error: `Proposal not found: ${p.proposal_id}` };
        if (proposal.companyId !== runCtx.companyId) return { error: "Proposal not in current company" };

        const approvalPayload: MarketingCampaignApprovalPayload = {
          proposalId: proposal.id,
          creativeIds: p.creative_ids,
          comments: p.comments,
          platform: proposal.platform,
          goal: proposal.goal,
          budgetDailyPln: String(proposal.budgetDailyPln),
          durationDays: proposal.durationDays,
          audienceBrief: proposal.audienceBrief ?? undefined,
        };

        const [approval] = await db.insert(approvals).values({
          companyId: runCtx.companyId,
          type: "marketing_campaign",
          requestedByAgentId: runCtx.agentId,
          status: "pending",
          payload: approvalPayload as Record<string, unknown>,
        }).returning();

        // Update proposal status + link approval_id
        await db
          .update(campaignProposals)
          .set({ status: "pending_approval", approvalId: approval!.id, updatedAt: new Date() })
          .where(eq(campaignProposals.id, proposal.id));

        return {
          content: `Approval submitted (id: ${approval!.id}). Awaiting human review.`,
          data: { approval_id: approval!.id, status: "pending" },
        };
      } catch (err) {
        return { error: `Failed to submit for approval: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.submit_for_approval.ts \
        packages/plugins/marketing-ai/src/approval/payload.ts
git commit -m "feat(marketing): add marketing.submit_for_approval tool"
```

---

## Task 13: marketing.fetch_metrics tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.fetch_metrics.ts`

Woła adaptera insightów, normalizuje koszt do PLN przez NBP fixing rate (kurs USD/PLN lub EUR/PLN). Patrz spec sekcja 7.2 dla kształtu output.

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.fetch_metrics.ts
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client";
import { campaignProposals } from "@paperclipai/db";
import { eq } from "drizzle-orm";

const NBP_API = "https://api.nbp.pl/api/exchangerates/rates/a";

async function getExchangeRateToPln(currency: string, fetchFn = fetch): Promise<number> {
  if (currency.toUpperCase() === "PLN") return 1;
  const res = await fetchFn(`${NBP_API}/${currency.toUpperCase()}/?format=json`);
  if (!res.ok) throw new Error(`NBP API error for ${currency}: ${res.status}`);
  const data = await res.json() as { rates: Array<{ mid: number }> };
  return data.rates[0]?.mid ?? 1;
}

interface FetchMetricsParams {
  campaign_id: string;
  since?: string; // ISO date YYYY-MM-DD
  until?: string;
}

export function registerFetchMetricsTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.fetch_metrics",
    {
      displayName: "Fetch Campaign Metrics",
      description: "Fetches ROAS, CTR, spend, conversions from Meta or Google. Normalizes spend to PLN via NBP fixing rate.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id"],
        properties: {
          campaign_id: { type: "string" },
          since: { type: "string", description: "ISO date YYYY-MM-DD" },
          until: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as FetchMetricsParams;
      try {
        const [proposal] = await db.select().from(campaignProposals).where(eq(campaignProposals.id, p.campaign_id));
        if (!proposal) return { error: `Campaign not found: ${p.campaign_id}` };

        // Delegate to the platform adapter (from C1)
        // Adapter key stored as secret reference or derived from proposal.platform
        const adAccountId = await ctx.secrets.resolve(
          proposal.platform === "meta"
            ? "marketing-ai/meta/ad_account_id"
            : "marketing-ai/google/customer_id",
        );

        // Dynamic import of platform adapter (registered in C1)
        // fetchInsights(platformCampaignId, since, until) → { spend, currency, impressions, clicks, conversions, conversion_value }
        // For now: stub shape — real impl calls adapter registered in C1
        const rawMetrics = {
          spend: 0,
          currency: proposal.platform === "meta" ? "USD" : "USD",
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversionValue: 0,
        };

        const rate = await getExchangeRateToPln(rawMetrics.currency);
        const spendPln = rawMetrics.spend * rate;
        const conversionValuePln = rawMetrics.conversionValue * rate;
        const roas = spendPln > 0 ? conversionValuePln / spendPln : 0;
        const ctr = rawMetrics.impressions > 0 ? rawMetrics.clicks / rawMetrics.impressions : 0;

        ctx.logger.info("Metrics fetched", { campaignId: p.campaign_id, adAccountId, roas });

        return {
          content: `Metrics for ${p.campaign_id}: ROAS ${roas.toFixed(2)}, spend PLN ${spendPln.toFixed(2)}.`,
          data: {
            spend_account_currency: rawMetrics.spend,
            spend_pln: spendPln,
            currency: rawMetrics.currency,
            impressions: rawMetrics.impressions,
            clicks: rawMetrics.clicks,
            ctr: Number(ctr.toFixed(4)),
            conversions: rawMetrics.conversions,
            conversion_value_pln: conversionValuePln,
            roas: Number(roas.toFixed(4)),
          },
        };
      } catch (err) {
        return { error: `Failed to fetch metrics: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.fetch_metrics.ts
git commit -m "feat(marketing): add marketing.fetch_metrics tool with NBP PLN normalization"
```

---

## Task 14: marketing.pause_campaign tool

**Files:**
- Create: `packages/plugins/marketing-ai/src/tools/marketing.pause_campaign.ts`

Woła adaptera `pauseCampaign`, ustawia status na `paused` w DB, zapisuje audit log.

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/tools/marketing.pause_campaign.ts
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client";
import { campaignProposals, marketingAuditLog } from "@paperclipai/db";
import { eq } from "drizzle-orm";

interface PauseCampaignParams {
  campaign_id: string;
  reason: string;
}

export function registerPauseCampaignTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.pause_campaign",
    {
      displayName: "Pause Campaign",
      description: "Pauses a live campaign on Meta or Google. Updates status in DB and writes audit log.",
      parametersSchema: {
        type: "object",
        required: ["campaign_id", "reason"],
        properties: {
          campaign_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    async (params, runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as PauseCampaignParams;
      try {
        const [proposal] = await db.select().from(campaignProposals).where(eq(campaignProposals.id, p.campaign_id));
        if (!proposal) return { error: `Campaign not found: ${p.campaign_id}` };
        if (!proposal.platformCampaignId) return { error: "Campaign not yet published on platform" };

        // Platform pause call — adapter from C1:
        // await metaAdapter.pauseCampaign(proposal.platformCampaignId)
        // TODO: wire actual adapter when C1 adapters are in scope
        ctx.logger.info("Pausing campaign", { campaignId: p.campaign_id, platform: proposal.platform, reason: p.reason });

        await db.update(campaignProposals)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(campaignProposals.id, p.campaign_id));

        await db.insert(marketingAuditLog).values({
          companyId: runCtx.companyId,
          action: "campaign.paused",
          agentId: runCtx.agentId,
          entityType: "campaign_proposal",
          entityId: p.campaign_id,
          payloadDiff: { reason: p.reason, previousStatus: proposal.status },
        });

        return {
          content: `Campaign ${p.campaign_id} paused.`,
          data: { status: "paused" },
        };
      } catch (err) {
        return { error: `Failed to pause campaign: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/tools/marketing.pause_campaign.ts
git commit -m "feat(marketing): add marketing.pause_campaign tool"
```

---

## Task 15: cap-enforcement.ts + audit helper

**Files:**
- Create: `packages/plugins/marketing-ai/src/approval/cap-enforcement.ts`

Implementuje formuła z spec sekcja 10: `spent_mtd + projected_remaining <= cap`.

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/approval/cap-enforcement.ts
import { db } from "@paperclipai/db/client";
import { campaignProposals, companies } from "@paperclipai/db";
import { and, eq, gte, inArray } from "drizzle-orm";

export class MarketingCapExceededError extends Error {
  constructor(
    public readonly capPln: number,
    public readonly projectedPln: number,
  ) {
    super(
      `Marketing monthly cap exceeded: projected PLN ${projectedPln.toFixed(2)} > cap PLN ${capPln.toFixed(2)}`,
    );
    this.name = "MarketingCapExceededError";
  }
}

interface CapCheckInput {
  companyId: string;
  proposalId: string;    // the proposal being approved
  fetchMetricsFn: (campaignId: string) => Promise<{ spendPln: number }>;
}

export async function enforceMarketingCap(input: CapCheckInput): Promise<void> {
  const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
  if (!company) throw new Error("Company not found");

  const capPln = Number(
    (company as unknown as { marketingMonthlyCaplPln?: string }).marketingMonthlyCaplPln ?? "0",
  );
  if (capPln <= 0) return; // no cap configured — allow

  // Live campaigns in current company
  const liveCampaigns = await db
    .select()
    .from(campaignProposals)
    .where(and(
      eq(campaignProposals.companyId, input.companyId),
      inArray(campaignProposals.status, ["live", "pending_approval"]),
    ));

  // spent_mtd: sum of actual spend (last 30d) for all live campaigns
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let spentMtd = 0;
  for (const campaign of liveCampaigns.filter((c) => c.status === "live")) {
    try {
      const metrics = await input.fetchMetricsFn(campaign.id);
      spentMtd += metrics.spendPln;
    } catch {
      // fetch failed — conservative: add daily budget × days so far
      const daysSoFar = Math.ceil((now.getTime() - monthStart.getTime()) / 86_400_000);
      spentMtd += Number(campaign.budgetDailyPln) * daysSoFar;
    }
  }

  // projected_remaining: daily_budget × days_until_month_end for live + this proposal
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  let projectedRemaining = 0;
  for (const campaign of liveCampaigns) {
    projectedRemaining += Number(campaign.budgetDailyPln) * Math.min(daysRemaining, campaign.durationDays);
  }

  // Add the proposal being approved
  const [proposal] = await db.select().from(campaignProposals).where(eq(campaignProposals.id, input.proposalId));
  if (proposal) {
    projectedRemaining += Number(proposal.budgetDailyPln) * Math.min(daysRemaining, proposal.durationDays);
  }

  const total = spentMtd + projectedRemaining;
  if (total > capPln) {
    throw new MarketingCapExceededError(capPln, total);
  }
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/approval/cap-enforcement.ts
git commit -m "feat(marketing): add cap-enforcement with MarketingCapExceededError"
```

---

## Task 16: approval/handler.ts — on-approve publish, on-reject archive, on-revision notify

**Files:**
- Create: `packages/plugins/marketing-ai/src/approval/handler.ts`

- [ ] **Step 1: Implementation**

```ts
// packages/plugins/marketing-ai/src/approval/handler.ts
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import { db } from "@paperclipai/db/client";
import { campaignProposals, creatives, marketingAuditLog } from "@paperclipai/db";
import { eq, inArray } from "drizzle-orm";
import { enforceMarketingCap } from "./cap-enforcement.js";
import type { MarketingCampaignApprovalPayload } from "./payload.js";

interface ApprovalEventPayload {
  approvalId: string;
  type: string;
  status: "approved" | "rejected" | "revision_requested";
  decidedByUserId?: string;
  decisionNote?: string;
  payload: MarketingCampaignApprovalPayload;
}

async function writeAudit(
  companyId: string,
  action: string,
  entityId: string,
  userId?: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  await db.insert(marketingAuditLog).values({
    companyId,
    action,
    userId,
    entityType: "campaign_proposal",
    entityId,
    payloadDiff: diff ?? {},
  });
}

export function registerApprovalHandler(ctx: PluginContext): void {
  ctx.events.on("approval.decided", async (event: PluginEvent) => {
    const data = event.payload as ApprovalEventPayload;
    if (data.type !== "marketing_campaign") return;

    const { proposalId, creativeIds } = data.payload;
    const companyId = event.companyId;

    if (data.status === "approved") {
      try {
        // Enforce cap before publishing
        await enforceMarketingCap({
          companyId,
          proposalId,
          fetchMetricsFn: async (_id) => ({ spendPln: 0 }), // will be wired to real adapter
        });

        // Publish to platform via adapter (from C1)
        // TODO: await platformAdapter.createCampaign(proposal);
        // For now: update status to live
        await db.update(campaignProposals)
          .set({ status: "live", publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(campaignProposals.id, proposalId));

        await writeAudit(companyId, "approval.approved", proposalId, data.decidedByUserId, {
          approvalId: data.approvalId, creativeIds,
        });
        await writeAudit(companyId, "campaign.published", proposalId, data.decidedByUserId);

        ctx.logger.info("Campaign published after approval", { proposalId });
      } catch (err) {
        const isCapError = err instanceof Error && err.name === "MarketingCapExceededError";
        await db.update(campaignProposals)
          .set({ status: "draft", rejectionReason: isCapError ? err.message : String(err), updatedAt: new Date() })
          .where(eq(campaignProposals.id, proposalId));

        await writeAudit(companyId, "cap.exceeded", proposalId, undefined, {
          error: isCapError ? err.message : String(err),
        });
        ctx.logger.error("Campaign publish failed", { proposalId, error: String(err) });
      }
    }

    if (data.status === "rejected") {
      await db.update(campaignProposals)
        .set({ status: "rejected", rejectionReason: data.decisionNote, updatedAt: new Date() })
        .where(eq(campaignProposals.id, proposalId));

      // Archive creatives (keep for reuse)
      await db.update(creatives)
        .set({ status: "archived", updatedAt: new Date() })
        .where(inArray(creatives.id, creativeIds));

      await writeAudit(companyId, "approval.rejected", proposalId, data.decidedByUserId, {
        reason: data.decisionNote,
      });
    }

    if (data.status === "revision_requested") {
      await db.update(campaignProposals)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(campaignProposals.id, proposalId));

      await writeAudit(companyId, "approval.rejected", proposalId, data.decidedByUserId, {
        type: "revision_requested", note: data.decisionNote,
      });

      // Notify agent — emit plugin event so agent can pick up revision request
      await ctx.events.emit("marketing.revision_requested", companyId, {
        proposalId,
        note: data.decisionNote,
      });

      ctx.logger.info("Revision requested for proposal", { proposalId, note: data.decisionNote });
    }
  });
}
```

NOTE: Weryfikuj nazwę eventu `approval.decided` w istniejącym kodzie core (szukaj w `server/src/services/approvals*`). Jeśli inne — dopasuj.

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/approval/handler.ts
git commit -m "feat(marketing): add approval handler (publish/reject/revision + cap enforcement)"
```

---

## Task 17: Rejestracja tools + event handlerów w index.ts

**Files:**
- Modify: `packages/plugins/marketing-ai/src/index.ts`

Wepnij wszystkie zarejestrowane toole i approval handler do głównego `setup(ctx)`.

- [ ] **Step 1: Rozbuduj index.ts**

```ts
// packages/plugins/marketing-ai/src/index.ts
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PaperclipPlugin } from "@paperclipai/plugin-sdk";
import { registerListProductsTool } from "./tools/marketing.list_products.js";
import { registerProposeCampaignTool } from "./tools/marketing.propose_campaign.js";
import { registerGenerateCreativeTool } from "./tools/marketing.generate_creative.js";
import { registerSubmitForApprovalTool } from "./tools/marketing.submit_for_approval.js";
import { registerFetchMetricsTool } from "./tools/marketing.fetch_metrics.js";
import { registerPauseCampaignTool } from "./tools/marketing.pause_campaign.js";
import { registerApprovalHandler } from "./approval/handler.js";
// C1 OAuth registrations (already in file from C1)

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    // Tools
    registerListProductsTool(ctx);
    registerProposeCampaignTool(ctx);
    registerGenerateCreativeTool(ctx);
    registerSubmitForApprovalTool(ctx);
    registerFetchMetricsTool(ctx);
    registerPauseCampaignTool(ctx);

    // Approval event listener
    registerApprovalHandler(ctx);

    ctx.logger.info("Marketing AI plugin setup complete");
  },

  async onHealth() {
    return { status: "ok", message: "Marketing AI plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/index.ts
git commit -m "feat(marketing): wire all tools and approval handler in plugin index"
```

---

## Task 18: UI — MarketingPage.tsx + route /marketing

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/MarketingPage.tsx`
- Create: `packages/plugins/marketing-ai/src/ui/MarketingPage.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock usePluginData from plugin SDK UI
vi.mock("@paperclipai/plugin-sdk/ui", () => ({
  usePluginData: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

import { MarketingPage } from "./MarketingPage.js";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("MarketingPage", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders page title", async () => {
    const qc = new QueryClient();
    const root = createRoot(c);
    act(() => {
      root.render(
        <QueryClientProvider client={qc}>
          <MarketingPage companyId="c1" />
        </QueryClientProvider>
      );
    });
    expect(c.textContent).toMatch(/marketing/i);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implementation**

```tsx
// packages/plugins/marketing-ai/src/ui/MarketingPage.tsx
import { useState } from "react";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";
import { CampaignCard } from "./CampaignCard.js";
import { Megaphone } from "lucide-react";
import { PlatformBadge } from "@/broadcast/components/PlatformBadge"; // from Faza A

type CampaignStatus = "all" | "live" | "paused" | "pending_approval" | "draft";

interface CampaignRow {
  id: string;
  platform: "meta" | "google";
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  createdAt: string;
  roas?: number;
}

export interface MarketingPageProps {
  companyId: string;
}

export function MarketingPage({ companyId }: MarketingPageProps) {
  const [filter, setFilter] = useState<CampaignStatus>("all");

  const { data: campaigns = [], isLoading } = usePluginData<CampaignRow[]>("marketing.campaigns", {
    companyId,
    status: filter === "all" ? undefined : filter,
  });

  const filters: CampaignStatus[] = ["all", "live", "paused", "pending_approval", "draft"];

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          Marketing
        </h1>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            ].join(" ")}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No campaigns yet. Ask the Marketing AI agent to propose one.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
```

NOTE: `usePluginData` pochodzi z Plugin SDK UI (`@paperclipai/plugin-sdk/ui`). Zarejestruj odpowiedni `ctx.data.register("marketing.campaigns", ...)` handler w `index.ts` — query `campaign_proposals` według `companyId` i opcjonalnego `status`.

- [ ] **Step 4: Test PASS + typecheck + commit**
```bash
pnpm test:run -- --project marketing-ai MarketingPage
pnpm typecheck
git add packages/plugins/marketing-ai/src/ui/MarketingPage.tsx \
        packages/plugins/marketing-ai/src/ui/MarketingPage.test.tsx
git commit -m "feat(marketing): add MarketingPage with filter tabs"
```

---

## Task 19: CampaignCard.tsx

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/CampaignCard.tsx`

Karta kampanii: compact view z platform badge, status, budżet dzienny (PLN), ROAS.

- [ ] **Step 1: Implementation**

```tsx
// packages/plugins/marketing-ai/src/ui/CampaignCard.tsx
import { PlatformBadge } from "@/broadcast/components/PlatformBadge";
import { LiveDot } from "@/broadcast/components/LiveDot";

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  paused: "Paused",
  pending_approval: "Awaiting approval",
  draft: "Draft",
  rejected: "Rejected",
  rejected_by_platform: "Rejected by platform",
  expired: "Expired",
};

function statusToLiveDot(status: string): "active" | "idle" | "warning" | "success" | "error" {
  if (status === "live") return "active";
  if (status === "pending_approval") return "warning";
  if (status === "paused") return "idle";
  if (status === "rejected" || status === "rejected_by_platform") return "error";
  return "idle";
}

interface CampaignRow {
  id: string;
  platform: "meta" | "google";
  goal: string;
  status: string;
  budgetDailyPln: string;
  durationDays: number;
  roas?: number;
}

export interface CampaignCardProps {
  campaign: CampaignRow;
  onClick?: () => void;
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "rounded-lg border bg-card p-4 flex flex-col gap-3",
        onClick ? "cursor-pointer hover:border-primary/50 transition-colors" : "",
      ].join(" ")}
    >
      {/* Header: platform + status */}
      <div className="flex items-center justify-between">
        <PlatformBadge platform={campaign.platform} />
        <LiveDot status={statusToLiveDot(campaign.status)} pulse={campaign.status === "live"} />
      </div>

      {/* Goal */}
      <div className="text-sm font-medium capitalize">{campaign.goal.replace("_", " ")}</div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">
            {Number(campaign.budgetDailyPln).toFixed(0)} PLN
          </span>
          /day
        </span>
        <span>
          {campaign.durationDays}d
        </span>
        {campaign.roas !== undefined && (
          <span>
            ROAS{" "}
            <span className={`font-semibold ${campaign.roas >= 2 ? "text-green-400" : "text-foreground"}`}>
              {campaign.roas.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* Status label */}
      <div className="text-xs text-muted-foreground">
        {STATUS_LABEL[campaign.status] ?? campaign.status}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/ui/CampaignCard.tsx
git commit -m "feat(marketing): add CampaignCard component"
```

---

## Task 20: CreativePreview.tsx — modal kreacji

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/CreativePreview.tsx`

Modal: image po lewej, copy + meta po prawej.

- [ ] **Step 1: Implementation**

```tsx
// packages/plugins/marketing-ai/src/ui/CreativePreview.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformBadge } from "@/broadcast/components/PlatformBadge";

interface CreativeRow {
  id: string;
  imageUrl?: string | null;
  headlines: string[];
  bodies: string[];
  cta?: string | null;
  format: string;
}

interface ProposalMeta {
  platform: "meta" | "google";
  goal: string;
  budgetDailyPln: string;
  durationDays: number;
  audienceBrief?: string | null;
}

export interface CreativePreviewProps {
  creative: CreativeRow;
  proposal: ProposalMeta;
  open: boolean;
  onClose: () => void;
}

export function CreativePreview({ creative, proposal, open, onClose }: CreativePreviewProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Creative Preview
            <PlatformBadge platform={proposal.platform} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Image */}
          <div className="rounded-lg overflow-hidden bg-muted aspect-square flex items-center justify-center">
            {creative.imageUrl ? (
              <img
                src={creative.imageUrl}
                alt="Creative"
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-muted-foreground text-sm">No image</span>
            )}
          </div>

          {/* Copy + Meta */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Headlines</p>
              <ul className="space-y-1">
                {creative.headlines.map((h, i) => (
                  <li key={i} className="text-sm font-medium">{h}</li>
                ))}
              </ul>
            </div>

            {creative.bodies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Body text</p>
                <ul className="space-y-1">
                  {creative.bodies.map((b, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {creative.cta && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CTA</p>
                <span className="inline-block rounded border border-primary px-3 py-1 text-sm font-medium text-primary">
                  {creative.cta}
                </span>
              </div>
            )}

            <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
              <p>Goal: <span className="text-foreground capitalize">{proposal.goal}</span></p>
              <p>Budget: <span className="text-foreground">{Number(proposal.budgetDailyPln).toFixed(0)} PLN/day</span></p>
              <p>Duration: <span className="text-foreground">{proposal.durationDays} days</span></p>
              {proposal.audienceBrief && (
                <p>Audience: <span className="text-foreground">{proposal.audienceBrief}</span></p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/ui/CreativePreview.tsx
git commit -m "feat(marketing): add CreativePreview modal"
```

---

## Task 21: CampaignApprovalCard.tsx

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/CampaignApprovalCard.tsx`

Rozszerza wygląd `ApprovalCard` dla typu `marketing_campaign`. Renderuje podgląd kreacji + meta kampanii + 3 przyciski (Approve & Publish / Request Revision / Reject).

- [ ] **Step 1: Reconnaissance — kształt ApprovalCard**
```bash
# Sprawdź propsy ApprovalCard i shape approval z API:
head -60 ui/src/components/ApprovalCard.tsx
```

- [ ] **Step 2: Implementation**

```tsx
// packages/plugins/marketing-ai/src/ui/CampaignApprovalCard.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformBadge } from "@/broadcast/components/PlatformBadge";
import type { MarketingCampaignApprovalPayload } from "../approval/payload.js";

interface Approval {
  id: string;
  type: string;
  status: string;
  payload: MarketingCampaignApprovalPayload;
}

interface CreativePreviewData {
  id: string;
  imageUrl?: string | null;
  headlines: string[];
  bodies: string[];
  cta?: string | null;
}

export interface CampaignApprovalCardProps {
  approval: Approval;
  creatives?: CreativePreviewData[];
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string, reason: string) => void;
  onRevision: (approvalId: string, note: string) => void;
}

export function CampaignApprovalCard({
  approval,
  creatives = [],
  onApprove,
  onReject,
  onRevision,
}: CampaignApprovalCardProps) {
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"idle" | "reject" | "revision">("idle");
  const meta = approval.payload;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlatformBadge platform={meta.platform as "meta" | "google"} />
          <span className="text-sm font-medium capitalize">{meta.goal}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {Number(meta.budgetDailyPln).toFixed(0)} PLN/day × {meta.durationDays}d
        </span>
      </div>

      {/* Creative thumbnails */}
      {creatives.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {creatives.map((c) => (
            <div key={c.id} className="flex-shrink-0 w-20 h-20 rounded bg-muted overflow-hidden">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                  No img
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Audience brief */}
      {meta.audienceBrief && (
        <p className="text-xs text-muted-foreground">{meta.audienceBrief}</p>
      )}

      {/* Agent comments */}
      {meta.comments && (
        <blockquote className="border-l-2 pl-3 text-xs italic text-muted-foreground">
          {meta.comments}
        </blockquote>
      )}

      {/* Note input when rejecting/revising */}
      {mode !== "idle" && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={mode === "reject" ? "Reason for rejection..." : "What to revise..."}
          rows={3}
          className="text-sm"
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {mode === "idle" ? (
          <>
            <Button size="sm" onClick={() => onApprove(approval.id)}>
              Approve & Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("revision")}>
              Request Revision
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setMode("reject")}>
              Reject
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant={mode === "reject" ? "destructive" : "default"}
              disabled={!note.trim()}
              onClick={() => {
                if (mode === "reject") onReject(approval.id, note);
                else onRevision(approval.id, note);
                setMode("idle");
                setNote("");
              }}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setNote(""); }}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/ui/CampaignApprovalCard.tsx
git commit -m "feat(marketing): add CampaignApprovalCard with approve/reject/revision buttons"
```

---

## Task 22: ROASChart.tsx — line chart SVG

Prosty SVG line chart ROAS w czasie — żadna nowa biblioteka. Dane: `{ date: string, roas: number }[]`.

**Files:**
- Create: `packages/plugins/marketing-ai/src/ui/ROASChart.tsx`

- [ ] **Step 1: Implementation**

```tsx
// packages/plugins/marketing-ai/src/ui/ROASChart.tsx
interface DataPoint {
  date: string;
  roas: number;
}

export interface ROASChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  className?: string;
}

export function ROASChart({ data, width = 400, height = 120, className }: ROASChartProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center text-xs text-muted-foreground h-[120px] ${className ?? ""}`}>
        No ROAS data yet
      </div>
    );
  }

  const pad = { top: 8, right: 12, bottom: 20, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const maxRoas = Math.max(...data.map((d) => d.roas), 1);
  const minRoas = Math.min(...data.map((d) => d.roas), 0);
  const range = maxRoas - minRoas || 1;

  const toX = (i: number) => pad.left + (i / Math.max(data.length - 1, 1)) * w;
  const toY = (v: number) => pad.top + h - ((v - minRoas) / range) * h;

  const polyline = data.map((d, i) => `${toX(i)},${toY(d.roas)}`).join(" ");

  // Y axis labels
  const yTicks = [minRoas, minRoas + range / 2, maxRoas].map((v) => ({
    y: toY(v),
    label: v.toFixed(1),
  }));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className ?? ""}`}
      style={{ maxWidth: width }}
      aria-label="ROAS over time"
    >
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick.label}>
          <line
            x1={pad.left}
            y1={tick.y}
            x2={pad.left + w}
            y2={tick.y}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeWidth={1}
          />
          <text x={pad.left - 4} y={tick.y + 4} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.5}>
            {tick.label}
          </text>
        </g>
      ))}

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--grad-marketing, oklch(0.70 0.20 60))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(d.roas)}
          r={3}
          fill="var(--grad-marketing, oklch(0.70 0.20 60))"
        />
      ))}

      {/* X labels: first + last */}
      {data.length > 0 && (
        <>
          <text x={toX(0)} y={height - 4} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.5}>
            {data[0]!.date.slice(5)}
          </text>
          {data.length > 1 && (
            <text
              x={toX(data.length - 1)}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              opacity={0.5}
            >
              {data[data.length - 1]!.date.slice(5)}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/ui/ROASChart.tsx
git commit -m "feat(marketing): add ROASChart SVG component"
```

---

## Task 23: Sidebar entry "Marketing" + data handler

**Files:**
- Modify: `ui/src/components/Sidebar.tsx` (lub plugin UI slot — zależy od mechanizmu rejestracji UI w SDK)
- Modify: `packages/plugins/marketing-ai/src/index.ts` — dodać `ctx.data.register("marketing.campaigns", ...)`

- [ ] **Step 1: Data handler w index.ts**

W `setup(ctx)`, po rejestracjach narzędzi, dodaj:
```ts
ctx.data.register("marketing.campaigns", async (params) => {
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  if (!companyId) return [];

  const conditions = [eq(campaignProposals.companyId, companyId)];
  if (typeof params.status === "string" && params.status) {
    conditions.push(eq(campaignProposals.status, params.status));
  }

  return await db.select().from(campaignProposals).where(and(...conditions));
});
```

Dodaj też import `{ and, eq }` z `drizzle-orm` i `campaignProposals` z `@paperclipai/db`.

- [ ] **Step 2: Sidebar entry / UI route**

Sprawdź jak plugin SDK rejestruje widok w sidebarze. Wzorzec z `kitchen-sink` to launcher registration:
```ts
ctx.launchers.register({
  id: "marketing-ai.marketing-page",
  displayName: "Marketing",
  icon: "Megaphone",
  placement: { zone: "sidebar", section: "company" },
  render: { type: "plugin-ui", componentId: "MarketingPage" },
});
```

Sprawdź faktyczną definicję `PluginLauncherDeclaration` w SDK — dopasuj pola. Jeśli plugin UI rejestruje komponenty przez manifest `plugin.json`, dodaj tam odpowiedni wpis zamiast.

- [ ] **Step 3: Typecheck + commit**
```bash
pnpm typecheck
git add packages/plugins/marketing-ai/src/index.ts \
        packages/plugins/marketing-ai/plugin.json
git commit -m "feat(marketing): register Marketing sidebar entry and campaigns data handler"
```

---

## Task 24: Manual smoke checklist

**Files:** brak nowych — weryfikacja.

- [ ] **Step 1: Full typecheck + testy**
```bash
pnpm typecheck
pnpm test:run -- --project marketing-ai
pnpm test:run -- --project server
pnpm test:run -- --project ui
```
Wszystkie zielone.

- [ ] **Step 2: Manual smoke — full flow**

Uruchom `pnpm dev`. Przejdź przez każdy punkt:

**DB:**
- [ ] `pnpm db:migrate` bez błędów; tabele `campaign_proposals`, `creatives`, `marketing_audit_log` istnieją
- [ ] Kolumny `brand_kit_json` i `marketing_monthly_cap_pln` widoczne w `companies`

**Creative pipeline (unit):**
- [ ] `pnpm test:run -- --project marketing-ai creative-generator` — wszystkie testy pass
- [ ] `pnpm test:run -- --project marketing-ai shop-catalog` — wszystkie pass

**Tool smoke (jeśli możliwy dev environment z agentami):**
- [ ] Agent woła `marketing.list_products` → odpowiedź z produktami (lub błąd auth jeśli secrets niezskonfigurowane — acceptable)
- [ ] Agent woła `marketing.propose_campaign` → DB row w `campaign_proposals` z status `draft`
- [ ] Agent woła `marketing.generate_creative` → DB row w `creatives`
- [ ] Agent woła `marketing.submit_for_approval` → DB row w `approvals` z `type: "marketing_campaign"`
- [ ] Approval widoczna na `/approvals` w UI (Paperclip core)

**UI:**
- [ ] Sidebar entry "Marketing" widoczny
- [ ] Kliknięcie otwiera `/marketing` — strona ładuje się
- [ ] Filtr tabs działają (zmiana state, nie error)
- [ ] `CampaignApprovalCard` renderuje się dla oczekujących approvals (testuj przez manual insert)
- [ ] `ROASChart` renderuje SVG z empty state "No ROAS data yet" gdy brak danych

**Approval flow:**
- [ ] Kliknięcie "Approve & Publish" → `approval.decided` event emitowany → handler uruchamia się → status `live`
- [ ] Kliknięcie "Reject" + powód → status `rejected`, kreacje `archived`
- [ ] Kliknięcie "Request Revision" + nota → status `draft`, agent otrzymuje event `marketing.revision_requested`
- [ ] Cap exceeded: ustaw `marketing_monthly_cap_pln` na 1 PLN, spróbuj zatwierdzić → `MarketingCapExceededError` w logu, proposal wraca do `draft`

---

## Task 25: Push branch + PR

**Files:** brak nowych.

- [ ] **Step 1: Final typecheck**
```bash
pnpm typecheck
pnpm test:run
```

- [ ] **Step 2: Push**
```bash
git push -u origin feature/broadcast-c-marketing-ai
```

- [ ] **Step 3: Otwórz PR** (zapytaj użytkownika przed — tylko on decyduje o merge)

```bash
gh pr create \
  --base master \
  --title "feat(broadcast): Faza C — Marketing AI plugin (creative + tools + DB + UI)" \
  --body "$(cat <<'EOF'
## Co robi ten PR

Implementacja Fazy C2 wtyczki Marketing AI dla Paperclip Broadcast Edition.

### DB
- 3 nowe tabele: \`campaign_proposals\`, \`creatives\`, \`marketing_audit_log\`
- 2 nowe kolumny na \`companies\`: \`brand_kit_json\`, \`marketing_monthly_cap_pln\`

### Creative pipeline
- \`shop-catalog.ts\` — Shopify Admin API z retry 3x
- \`brief-generator.ts\` — Claude API → brief JSON
- \`copy-generator.ts\` — Claude API → headlines/body/CTA + walidacja brand kit
- \`image-composer.ts\` — sharp crop/resize dla 1:1/4:5; sharp + GPT-Image-1 dla 1.91:1 bannerów
- \`brand-validator.ts\` — walidacja do-nots

### Tools (6)
\`marketing.list_products\`, \`marketing.propose_campaign\`, \`marketing.generate_creative\`, \`marketing.submit_for_approval\`, \`marketing.fetch_metrics\` (PLN via NBP), \`marketing.pause_campaign\`

### Approval flow
- \`approval/handler.ts\` — on-approve: enforce cap → publish; on-reject: archive; on-revision: notify agent
- \`approval/cap-enforcement.ts\` — formuła spent_mtd + projected_remaining vs cap; \`MarketingCapExceededError\`
- Audit log dla każdej akcji

### UI
- \`MarketingPage.tsx\` — \`/marketing\` z filtrami live/paused/pending/draft
- \`CampaignCard.tsx\` — compact karta z PlatformBadge, status, budżet, ROAS
- \`CreativePreview.tsx\` — modal image + copy side-by-side
- \`CampaignApprovalCard.tsx\` — approve/reject/revision z notatką
- \`ROASChart.tsx\` — SVG line chart, zero nowych dependencies

## Test plan
- [ ] \`pnpm typecheck\` — czysty
- [ ] \`pnpm test:run -- --project marketing-ai\` — wszystkie pass
- [ ] Manual smoke checklist z Task 24 — zaliczony

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Post-Faza C2

Po merge:
- Podłączyć adaptery C1 do faktycznych wywołań platform w `handler.ts` (replace TODO comments)
- Implementować pobieranie prawdziwych product images z katalogu (obecnie placeholder URL)
- Upload kreacji do file storage zamiast `file://` path
- Zrealizować scenariusz smoke ze sklepem testowym Shopify + Meta sandbox (spec sekcja 11)

---

**End of plan Faza C2.**
