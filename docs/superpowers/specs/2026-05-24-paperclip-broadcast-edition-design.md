# Paperclip Broadcast Edition — Design Spec

**Status:** Draft v1 (do review)
**Author:** Michał Barczak + Claude
**Date:** 2026-05-24
**Topic:** Pełen reskin Paperclipa + Live Ops view + plugin Marketing AI (Meta + Google Ads)
**Implementation phasing:** A → B → C (jeden spec, trzy fazy)

---

## 1. Cel

Zbudować trzy zintegrowane warstwy nad istniejącym Paperclipem, które razem tworzą produkt nadający się do publicznego pokazywania jako "operator AI-firmy" i jednocześnie do realnej pracy nad sklepem wędkarskim:

- **(A) Broadcast Theme** — głęboki reskin warstwy wizualnej w stylu BAZA-GEEKWORK-CLICK (cockpit + gamification + CRM + brand), pełny każdy frontowy ekran
- **(B) Live Ops View** — hero widok `/live` pokazujący w czasie rzeczywistym, co który agent robi, z bogatymi cinematic kartami (level, streak, cost ticker, current thought, equalizer)
- **(C) Marketing AI Plugin** — realna integracja Meta Marketing API + Google Ads API, agent samodzielnie projektuje kampanie i kreacje (hybryda: AI brief + copy, zdjęcia produktów ze sklepu), human-in-the-loop approval przed publikacją

Wszystko obsługuje sklep wędkarski (stawiany przez użytkownika **poza scope** tego specu) jako pierwszą realną firmę.

## 2. Non-goals (świadome wykluczenia)

- **Budowanie sklepu wędkarskiego** — wybór platformy, postawienie, zdjęcia, fulfillment, płatności, SEO. Użytkownik robi sam, spec zakłada że sklep istnieje i ma katalog produktów dostępny przez API (Shopify Admin API albo equivalent).
- **TikTok Ads, Allegro Ads, LinkedIn Ads** — tylko Meta + Google w pierwszej iteracji.
- **Pełna autonomia agenta reklamowego** — każda kampania przechodzi przez human approval. Auto-pauza, dynamiczne re-budgetowanie i optymalizacja w locie są poza scope.
- **Multi-tenant agency mode** — single tenant (jedna firma w Paperclipie zarządza sklepem wędkarskim). Architektura nie blokuje multi-tenant, ale UI/governance nie są pod to projektowane.
- **Generowanie wideo** — tylko statyczne obrazy w kreacjach.
- **Animowane B-roll pod cuts wideo** — użytkownik nagrywa "gadającą głowę", więc animacje są ambient (ciągłe, niskie tempo, nieirytujące), nie pod frame-perfect cuts.
- **Reskin Settings / onboarding / debug screens** — te ekrany dostają tylko nowe tokeny CSS (kolory, fonty), bez przepisywania komponentów.

## 3. Założenia

- Sklep wędkarski jest na Shopify (rekomendowane) lub equivalent — agent może pobrać katalog produktów i zdjęcia przez API.
- Użytkownik ma konta Meta Business Manager + Google Ads (manager account / standard account) oraz odpowiednie uprawnienia developerskie (Meta App, Google Ads developer token).
- Image generation: OpenAI Images API (GPT-Image-1) jako default, możliwy swap na Flux/Replicate w fazie 2 jeśli jakość się okaże niewystarczająca. Hybryda: kreacje używają głównie zdjęć produktów z katalogu sklepu, gen-AI generuje tylko **dodatkowe** kompozycje / banery, jak potrzebne.
- Istniejące systemy Paperclipa (Approvals, Plugin SDK, Heartbeats, Runs, Transcripts) zostają i są wykorzystywane.
- Stack: zostaje (React 19, TS, Tailwind v4, shadcn/ui, Radix, Node 20+, embedded Postgres, Drizzle).

## 4. Architektura wysokopoziomowa

```
┌─────────────────────────────────────────────────────────────────┐
│  WARSTWA A — BROADCAST THEME                                   │
│  ui/src/broadcast/{tokens.css, components/, hooks/}            │
│  Nowe tokeny CSS + cinematic komponenty (AgentBroadcastCard,   │
│  LevelBadge, StreakBadge, XPBar, EqualizerIndicator,          │
│  CostTicker, GlowFrame, MissionCard)                          │
│  Zastosowane w całym UI Paperclipa.                           │
└─────────────────────────────────────────────────────────────────┘
              ▲                                  ▲
              │ używa                            │ używa
┌─────────────┴────────────────┐    ┌────────────┴────────────────┐
│  WARSTWA B — LIVE OPS VIEW   │    │  WARSTWA C — MARKETING AI   │
│  ui/src/pages/LiveOps.tsx    │    │  packages/plugins/marketing │
│  + server/live-ops/          │    │  - meta-ads adapter         │
│  + db schema rozszerzenie    │    │  - google-ads adapter       │
│    eventu o currentThought/  │    │  - ai-creative generator    │
│    currentTool/costDelta     │    │  - widok /marketing         │
│                              │    │  - approval integration     │
└──────────────────────────────┘    └─────────────────────────────┘
              │                                  │
              └──────────► Paperclip core ◄──────┘
                  (heartbeats, agents, approvals,
                   plugin SDK, runs, transcripts)
```

**Trzy zasady granic:**
1. **A nie zależy od niczego** — można shippować same komponenty cinematic do każdego ekranu w obecnym Paperclipie.
2. **B i C są niezależne między sobą** — Live Ops nic nie wie o Marketing AI, Marketing AI nic nie wie o Live Ops. Oba używają A.
3. **C jest pluginem** — `@paperclipai/plugin-marketing-ai`, instalowalny przez Plugin SDK, nie modyfikuje core.

## 5. Warstwa A — Broadcast Theme

### 5.1. Tokeny

Plik: `ui/src/broadcast/tokens.css`. Wprowadza nowe CSS variables nad istniejącymi w `index.css`:

```css
:root[data-theme="broadcast"] {
  /* Bazowe overridy istniejących tokenów */
  --background: oklch(0.08 0 0);              /* głębsza czerń */
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.11 0 0);
  --border: oklch(0.18 0 0);
  --accent: oklch(0.20 0.04 240);

  /* Nowe tokeny gradientów cinematic */
  --grad-agent: linear-gradient(135deg, oklch(0.65 0.18 220), oklch(0.55 0.16 200));
  --grad-marketing: linear-gradient(135deg, oklch(0.70 0.20 60), oklch(0.60 0.22 30));
  --grad-engineering: linear-gradient(135deg, oklch(0.65 0.20 280), oklch(0.55 0.18 260));
  --grad-cost: linear-gradient(135deg, oklch(0.85 0.15 200), oklch(0.75 0.20 280));

  /* Glow / aura */
  --glow-active: 0 0 30px oklch(0.65 0.18 220 / 0.25);
  --glow-warning: 0 0 30px oklch(0.70 0.20 60 / 0.25);
  --glow-success: 0 0 30px oklch(0.70 0.18 145 / 0.30);

  /* Gamification */
  --xp-bar-fill: linear-gradient(90deg, oklch(0.75 0.18 145), oklch(0.85 0.20 100));
  --level-badge: linear-gradient(135deg, oklch(0.75 0.18 60), oklch(0.65 0.22 25));
  --streak-flame: linear-gradient(180deg, oklch(0.80 0.22 30), oklch(0.70 0.25 15));

  /* Typography weights pod cinematic */
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", monospace;
}
```

**Strategia migracji tokenów:** `data-theme="broadcast"` jest **domyślnym** trybem w Paperclipie po Fazie A2 (w A1 jeszcze za feature flagiem — patrz sekcja 12). Istniejące zmienne dostają nowe wartości (overide), ale nazwy zostają — wszystkie istniejące komponenty automatycznie odbierają nowy look bez przepisywania. Nowe tokeny (`--grad-*`, `--glow-*`, gamification) są używane tylko przez nowe komponenty cinematic.

### 5.2. Komponenty cinematic (nowe)

Lokalizacja: `ui/src/broadcast/components/`. Każdy ma CVA dla wariantów + jest dodany do `/design-guide`.

| Komponent | Cel | Kluczowe propsy |
|---|---|---|
| `AgentBroadcastCard` | Karta agenta typu "C cinematic" z mockupu — używana w Live Ops, Agents list, Marketing AI | `agent`, `currentRun`, `cost`, `costCap`, `currentTool`, `currentThought`, `tags`, `level`, `streak`, `variant: 'compact' \| 'full' \| 'hero'` |
| `LevelBadge` | Złoto-czerwony badge z numerem levelu | `level`, `size: 'xs' \| 'sm' \| 'md'` |
| `StreakBadge` | Płomień + dni | `days`, `size` |
| `XPBar` | Pasek postępu XP w gradiencie | `current`, `target`, `label` |
| `EqualizerIndicator` | 4 pionowe paski animowane gdy agent aktywny | `active`, `intensity?: 'low' \| 'med' \| 'high'` |
| `CostTicker` | Animowana liczba kosztu w gradient text, optional cap | `value`, `cap?`, `currency` |
| `GlowFrame` | Container z aurą wokół, kolor zależny od stanu | `state: 'active' \| 'idle' \| 'warning' \| 'success' \| 'error'`, `children` |
| `MissionCard` | "Misja" — gamifikowana karta dużego zadania (kampania, projekt) z progressem, podzadaniami | `mission`, `tasks`, `reward?`, `progress` |
| `PlatformBadge` | Tag platformy reklamowej (Meta/Google) — w kolorze brand | `platform: 'meta' \| 'google'` |
| `LiveDot` | Pulsujący kolorowy dot + tekst statusu | `status`, `pulse?` |
| `ThoughtStream` | Stream "myśli" agenta — przewijająca się terminal-styled konsola | `runId`, `maxLines?` |

### 5.3. Animacje (ambient)

Wszystkie animacje są **ambient** — niskotempowe, niemęczące w 8h sesji pracy:

- `pulse`: 1.5s ease-in-out infinite, scale 1 → 1.08, opacity 1 → 0.6
- `glow`: opacity boxShadow pulsuje 2s
- `equalizer-wave`: 4 paski, każdy ma własną fazę 0.8s, scaleY 0.4 → 1
- `blink`: cursor blink 1s, tylko gdy agent aktywnie generuje
- `xp-fill`: animacja wypełnienia paska 600ms cubic-bezier(0.4, 0, 0.2, 1) gdy XP rośnie
- `level-up`: jednorazowa eksplozja confetti 1s + scale 1 → 1.2 → 1 na LevelBadge

`prefers-reduced-motion`: wszystkie animacje wyłączone, statyczne wartości.

### 5.4. Reskin istniejących komponentów

Lista komponentów, które dostają pełen pass (z tej puli identyfikowanej w `ui/src/components/`):

**Frontowe (pełny reskin, używają cinematic):**
`Sidebar`, `Layout`, `BreadcrumbBar`, `CompanySwitcher`, `CompanyRail`, `SidebarSection`, `SidebarNavItem`, `SidebarAgents`, `SidebarProjects`, `MetricCard`, `ActivityCharts`, `ActivityRow`, `ActiveAgentsPanel`, `IssueRow`, `IssuesList`, `IssueWorkspaceCard`, `IssueProperties`, `GoalTree`, `GoalProperties`, `KanbanBoard`, `EntityRow`, `StatusBadge`, `StatusIcon`, `PriorityIcon`, `ApprovalCard`, `ApprovalPayload`, `LiveRunWidget`, `RunTranscriptView`, `MarkdownBody`, `EmptyState`, `PageSkeleton`, `PageTabBar`, `MobileBottomNav`, `FinanceTimelineCard`, `FinanceBillerCard`, `FinanceKindCard`, `BillerSpendCard`, `BudgetPolicyCard`, `BudgetIncidentCard`, `QuotaBar`, `ProviderQuotaCard`, `CommentThread`.

**Pomocnicze (tylko nowe tokeny CSS, brak reskinu kodu):**
`Settings*`, `Onboarding*`, `DevRestartBanner`, `WorktreeBanner`, `PathInstructionsModal`, `ExecutionWorkspaceCloseDialog`, `JsonSchemaForm`.

## 6. Warstwa B — Live Ops View

### 6.1. Route i scope

- Nowy widok `/live` (i `/live/:agentId` dla full-screen pojedynczego agenta — tryb "broadcast solo")
- Wpis w sidebarze (sekcja Operations, ikona `Activity` / `Radio`)
- Domyślny widok główny po wejściu w firmę (zamiast obecnego dashboardu) — z możliwością przełączenia w settings

### 6.2. Layout

**`/live` (grid wszystkich agentów):**

```
┌────────────────────────────────────────────────────────────────┐
│  Header: "LIVE OPS — Sklep Wędkarski" | filters | broadcast on │
├────────────────────────────────────────────────────────────────┤
│  Top strip: 4 metryki dnia (Active Agents, Tasks Done, Cost,   │
│                              Approvals Pending)                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│   │ Agent 1  │  │ Agent 2  │  │ Agent 3  │  │ Agent 4  │     │
│   │ broadcast│  │ broadcast│  │ broadcast│  │ broadcast│     │
│   │   card   │  │   card   │  │   card   │  │   card   │     │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│   │ ...      │  │ ...      │  │ ...      │  │ ...      │     │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Footer: Recent Approvals (mini cards, click → approve modal)  │
└────────────────────────────────────────────────────────────────┘
```

- Grid responsywny: `xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2`
- Każda karta = `AgentBroadcastCard variant="full"`
- "Broadcast on" toggle przełącza wszystkie karty w `variant="hero"` (większe, mocniejsza animacja, ukryte UI chrome)

**`/live/:agentId` (broadcast solo):**

Jedna duża karta `AgentBroadcastCard variant="hero"` centralnie + `ThoughtStream` rozszerzony do 12 linii + lista wykonanych tooli w ciągu ostatniej godziny.

### 6.3. Stream danych

**Backend rozszerzenie — tabela `heartbeat_runs` (NIE `heartbeat_run_events`):**

Live Ops potrzebuje **bieżącego stanu per-agent**, nie pełnej historii eventów. Najefektywniej trzymać aktualne wartości w wierszu runu, aktualizowane przy każdym evencie. Per-event historia zostaje w `heartbeat_run_events.payload` jsonb (już istnieje, bez migracji).

Migracja Drizzle rozszerzy `heartbeat_runs`:

```sql
ALTER TABLE heartbeat_runs
  ADD COLUMN current_thought TEXT,
  ADD COLUMN current_tool VARCHAR(128),
  ADD COLUMN current_cost_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN current_thought_updated_at TIMESTAMPTZ;
```

- `current_thought` — ostatnia istotna linia z LLM message (filtr: pomijaj `tool_use`, `system`, bierz tylko `assistant: text`). Truncate do 240 znaków. Updated przy każdym evencie typu `assistant_message`.
- `current_tool` — nazwa toola aktualnie wykonywanego. Set przy `tool_use_start`, clear (NULL) przy `tool_use_end`.
- `current_cost_cents` — kumulatywny koszt runu w 1/100 USD (NUMERIC nie używamy bo prosta inkrementacja). Inkrementowany przy każdym evencie z usage data.
- `current_thought_updated_at` — timestamp last update; UI wycisza karty agentów z >60s stale thought.

Index: `idx_heartbeat_runs_company_status_started` na `(company_id, status, started_at desc)` dla szybkiego `SELECT FROM heartbeat_runs WHERE company_id=? AND status='running'`.

**Service layer:**

Istniejący handler eventów (gdzieś w `server/src/services/heartbeat-*`) dostaje rozszerzenie: przy zapisie do `heartbeat_run_events` także updatuje pola na `heartbeat_runs` zgodnie z eventType. Operacja w transakcji.

**Frontend:**

- `useLiveOpsAgents(companyId)` hook — pollluje nowy endpoint `GET /api/companies/:id/live-agents` co 2s; endpoint zwraca: dla każdego agenta firmy → najnowszy `heartbeat_run` (jeśli status `running` / `queued`) z polami current_*
- Każda karta ma opcjonalny `useLiveRunTranscripts(runId)` (istniejący hook) dla rozszerzonej historii w `variant="hero"` / `/live/:agentId`

### 6.4. Komponenty B

| Komponent | Cel |
|---|---|
| `LiveOpsPage` | Page wrapper, top metrics + grid + footer approvals |
| `LiveOpsGrid` | Grid z kartami, obsługuje toggle broadcast |
| `LiveOpsTopMetrics` | 4 `MetricCard` z animowanymi liczbami (np. CostTicker) |
| `LiveOpsApprovalsFooter` | Strip ostatnich approval requests + modal |
| `AgentSoloPage` | Route `/live/:agentId`, jedna duża karta + transcript |

## 7. Warstwa C — Marketing AI Plugin

### 7.1. Lokalizacja i struktura

```
packages/plugins/marketing-ai/
├── package.json                      "@paperclipai/plugin-marketing-ai"
├── plugin.json                       manifest
├── src/
│   ├── index.ts                      plugin entry, registerTools
│   ├── adapters/
│   │   ├── meta-ads/
│   │   │   ├── auth.ts               OAuth2 flow
│   │   │   ├── client.ts             facebook-business-sdk wrapper
│   │   │   ├── campaigns.ts          create/update/pause
│   │   │   ├── adsets.ts
│   │   │   ├── ads.ts
│   │   │   └── insights.ts           ROAS, CTR, spend
│   │   └── google-ads/
│   │       ├── auth.ts
│   │       ├── client.ts             google-ads-api wrapper
│   │       ├── campaigns.ts
│   │       ├── adgroups.ts
│   │       ├── assets.ts
│   │       └── metrics.ts
│   ├── creative/
│   │   ├── brief-generator.ts        LLM call (Claude) -> brief JSON
│   │   ├── copy-generator.ts         LLM call -> headlines + descriptions
│   │   ├── image-composer.ts         miksuje zdjęcia produktów ze sklepu + ewentualne gen-AI tła (GPT-Image-1)
│   │   └── shop-catalog.ts           pobiera produkty + zdjęcia ze sklepu (Shopify Admin API)
│   ├── tools/                        toole dla AI agenta
│   │   ├── marketing.propose_campaign.ts
│   │   ├── marketing.generate_creative.ts
│   │   ├── marketing.submit_for_approval.ts
│   │   ├── marketing.fetch_metrics.ts
│   │   └── marketing.pause_campaign.ts
│   ├── approval/
│   │   ├── payload.ts                shape approval payloadu typu "campaign"
│   │   └── handler.ts                on-approve -> publish, on-reject -> cleanup
│   └── ui/
│       ├── MarketingPage.tsx         widok /marketing
│       ├── CampaignCard.tsx          karta kampanii (proposal / live / paused)
│       ├── CreativePreview.tsx       preview kreacji (image + copy + meta)
│       ├── ROASChart.tsx
│       └── CampaignApprovalCard.tsx  rozszerzenie ApprovalCard pod kampanie
└── tests/
    ├── e2e-meta-fake.test.ts
    ├── e2e-google-fake.test.ts
    └── creative-generator.test.ts
```

### 7.2. Tools (interface AI ↔ plugin)

Każdy tool ma JSON schema input + output, plugin SDK rejestruje je. Agent woła z konwersacji.

| Tool | Input | Output | Side effect |
|---|---|---|---|
| `marketing.list_products` | `{ category?, limit? }` | `{ products: [{ id, title, price, image_urls[], stock }] }` | brak |
| `marketing.propose_campaign` | `{ platform: 'meta'\|'google', goal: 'sales'\|'awareness'\|'leads', product_ids: [], budget_daily_pln, duration_days, audience_brief }` | `{ campaign_proposal: {...}, ad_sets: [...], estimated_reach }` | zapisuje proposal do DB jako `campaign_proposal` |
| `marketing.generate_creative` | `{ proposal_id, format: 'single_image'\|'carousel', headline_count?, body_count? }` | `{ creatives: [{ id, image_url, headlines[], bodies[], cta }] }` | wywołuje LLM (copy) + image-composer (obraz/y); zapisuje do `creative` table |
| `marketing.submit_for_approval` | `{ proposal_id, creative_ids[], comments? }` | `{ approval_id, status: 'pending' }` | tworzy `Approval` typu `marketing_campaign` w core Paperclip |
| `marketing.fetch_metrics` | `{ campaign_id, since?, until? }` | `{ spend_account_currency, spend_pln, currency, impressions, clicks, ctr, conversions, conversion_value_pln, roas }` | call do Meta/Google Insights; konwersja przez NBP fixing rate dla raportowania zunifikowanego w PLN |
| `marketing.pause_campaign` | `{ campaign_id, reason }` | `{ status: 'paused' }` | call do platformy + log |

### 7.3. Approval flow

1. Agent woła `marketing.propose_campaign(...)` → DB row `campaign_proposal` (status `draft`)
2. Agent woła `marketing.generate_creative(proposal_id, ...)` → kilka creative rows powiązanych z proposalem
3. Agent woła `marketing.submit_for_approval(...)` → tworzy `Approval { type: 'marketing_campaign', payload: { proposal_id, creative_ids } }`
4. UI Paperclipa renderuje approval w `LiveOpsApprovalsFooter` i na `/approvals`. `CampaignApprovalCard` rozszerza `ApprovalCard` o:
   - preview kreacji (image + copy + headline)
   - meta kampanii (platforma, budżet, audiencja, duration, estimated reach)
   - przyciski **Approve & Publish** / **Request Revision** / **Reject**
5. **Approve**: handler woła `adapters/{platform}/campaigns.publish(proposal)` → real call do API → status proposal `live` → karta kampanii pojawia się na `/marketing` z live metrics
6. **Request Revision**: payload z komentarzem wraca do agenta jako transcript message; agent może wywołać `marketing.propose_campaign(...)` ponownie z poprawkami
7. **Reject**: status proposal `rejected`, kreacje zachowane w archiwum (asset library do reuse)

### 7.4. OAuth + secrets

Secrets storage: Paperclip ma już zaimplementowany system w `server/src/secrets/` (`local-encrypted-provider.ts`, `provider-registry.ts`) z tabelami `company_secrets` + `company_secret_versions` i pluginowym handlerem `server/src/services/plugin-secrets-handler.ts`. Plugin Marketing AI używa go bez dodatkowej infrastruktury.

- **Meta**: standard OAuth2 (Business Login), redirect URI `http://localhost:3100/api/plugins/marketing-ai/oauth/meta/callback`, scopes `ads_management`, `ads_read`, `business_management`. Access token + long-lived token + ad account ID zapisane jako 3 sekrety pod kluczami `marketing-ai/meta/access_token`, `marketing-ai/meta/long_lived_token`, `marketing-ai/meta/ad_account_id` w `company_secrets` (encrypted at rest).
- **Google Ads**: OAuth2 + developer token. Refresh token, customer ID (manager), klient developer token jako sekrety `marketing-ai/google/refresh_token`, `marketing-ai/google/customer_id`, `marketing-ai/google/developer_token`.

Konfiguracja pluginu w UI (settings) ma stronę "Marketing AI" gdzie użytkownik klika **Connect Meta** / **Connect Google**, przechodzi OAuth flow w popup, widzi status `connected ✓` + last refresh time + przyciski **Reconnect** / **Disconnect** (Disconnect kasuje sekrety).

### 7.5. Generator kreacji (creative pipeline)

```
agent.propose_campaign
        │
        ▼
brief-generator (Claude)
   - input: produkt(y), goal, audience_brief
   - output: brief.json (positioning, tone, key benefits, hooks)
        │
        ▼
copy-generator (Claude)
   - input: brief.json, platform
   - output: { headlines[5], primary_texts[3], descriptions[3], cta }
        │
        ▼
image-composer
   - input: brief.json, product.image_urls[], target placements
   - hybryda:
     a) jeśli kreacja statyczna 1:1 / 4:5 → bierze image produktu, crop/resize
     b) jeśli kreacja banner 1.91:1 (Meta link ad) → image produktu + gen-AI generuje tło/scenę
        (GPT-Image-1, prompt z briefu) → kompozycja sharp/canvas
   - output: { image_url (saved to file storage), variants[] }
        │
        ▼
zapisz CreativeRow + return do agenta
```

**Brand guard:** brief.json zawiera `brand_voice` (sklep ma dedykowane property w `Company` table — pole `brand_kit_json` zawierające kolory, tone of voice, do-nots, mandatory phrases). Brief-generator dostaje to jako system prompt. Copy-generator weryfikuje że output nie łamie do-nots (lista zakazanych zwrotów, np. "darmowy" jeśli sklep nie daje free shipping).

## 8. Data flow & events (cross-warstwowo)

```
┌─────────────────────────────────────────────────────────────┐
│  Agent run (Claude / OpenClaw / Codex / ...)               │
│  emituje heartbeat eventy z transcript + tool_use         │
└─────────────────────────────────────────────────────────────┘
        │
        ▼  (rozszerzenie tabeli — sekcja 6.3)
┌─────────────────────────────────────────────────────────────┐
│  heartbeat_runs (updated per event)                        │
│  + current_thought, current_tool,                          │
│    current_cost_cents, current_thought_updated_at         │
│  heartbeat_run_events (history, bez zmian schemy)         │
└─────────────────────────────────────────────────────────────┘
        │
        ├─────► (poll 2s) Live Ops View — karty agentów
        │
        └─────► Marketing AI plugin (gdy agent wywoła tool)
                        │
                        ▼
                campaign_proposal + creative tables
                        │
                        ▼
                Approval (core Paperclip)
                        │
                        ├─► Live Ops footer
                        ├─► /approvals page
                        └─► CampaignApprovalCard (rich preview)
                                │
                                ▼ approve
                        Meta / Google API publish
                                │
                                ▼
                        Campaign live → metrics fetch loop
```

## 9. Error handling

- **OAuth failure**: redirect na stronę settings Marketing AI z komunikatem; status `disconnected` w UI; agent dostaje `MarketingAuthError` w tool response — `marketing.*` tools zwracają błąd zanim woła API.
- **API rate limit** (Meta / Google): exponential backoff + queue; tool zwraca `{ status: 'pending', retry_in_seconds }`; UI pokazuje "rate-limited, retry w XX s" na kampanii.
- **API publish failure** (np. odrzucenie kreacji przez Meta z powodu policy): status proposal `rejected_by_platform`, payload zawiera Meta error code + suggestion; UI pokazuje raison + przycisk "Regenerate creative"; agent dostaje informację i może spróbować ponownie.
- **Image generation failure**: retry 2x, jeśli wciąż fail → kreacja oznaczona `incomplete`, agent dostaje błąd, może spróbować innego promptu lub kreacji bez gen-AI (tylko image produktu).
- **Shop API timeout**: retry 3x z 1s backoff, jeśli wciąż fail → tool `marketing.list_products` zwraca cached snapshot (cache 1h) lub error jeśli brak cache.
- **Approval expires** (proposal nie został approve/reject w 24h): status `expired`, agent dostaje notification, może resubmitować.
- **Budget cap exceeded** (rzeczywiste wydatki na platformie przekroczyły deklarowany budget): plugin codziennie sprawdza spend vs deklarowany budget; jeśli >100% → auto-pauza kampanii + alert do operatora.

## 10. Governance i koszty

- **Cost cap, dwa poziomy:**
  - **Per-agent**: każdy agent ma już `monthly_budget_usd` w Paperclipie — to limit na tokeny LLM, zostaje bez zmian.
  - **Per-company, marketing-specific**: Marketing AI dodaje `marketing_monthly_cap_pln` jako property na `Company` (jeden cap na firmę, bo single tenant; obejmuje sumę wydatków na Meta + Google razem). Egzekwowany w `approval/handler.ts` przed publish. Formuła: `spent_mtd + projected_remaining <= cap`, gdzie `spent_mtd` = suma `spend_pln` z `marketing.fetch_metrics` (cache 1h) dla wszystkich live kampanii firmy w bieżącym miesiącu, a `projected_remaining` = sum across all live + proposed campaigns of `daily_budget_pln * days_until_month_end`. Jeśli wynik >cap → approval kończy się błędem `MarketingCapExceededError` z komunikatem ile brakuje.
  - **Daily soft alert**: dzienne sprawdzenie spend vs cap; jeśli >80% miesięcznego capu — alert na dashboard (toast + LiveOpsApprovalsFooter banner), nie blokuje, ale ostrzega.
- **Audit log**: każda akcja Marketing AI (proposal, generate, submit, approve, publish, pause) zapisana w `marketing_audit_log` z user_id (kto approved), agent_id, timestamp, payload diff. Eksport CSV w UI.
- **Secrets**: Meta + Google + OpenAI klucze w istniejącym secrets store Paperclipa (encrypted at rest), nigdy w plain text, nigdy w logach.

## 11. Testowanie

- **Unit (per komponent)**:
  - Vitest dla broadcast components (snapshot tokenów, animacji wyłączonych pod reduced-motion)
  - Vitest dla creative-generator (mock LLM responses, weryfikacja brand_kit)
  - Vitest dla adapters/meta i adapters/google (mock SDK, verify request shape)
- **Integration**:
  - Playwright e2e: scenariusz "agent proposal → approval pending → user approves → published"
  - Mocked Meta / Google API server (lokalny stub) — testy nie biją w prawdziwe API
- **Manual smoke** (przed pierwszym filmem YT):
  - Faza A: każdy frontowy ekran ręcznie przejrzany, screenshot snapshot test (Storybook lub `/design-guide` page)
  - Faza B: 4 agenty równolegle pracujące na różnych zadaniach, sprawdzić że Live Ops nie laguje, broadcast mode toggle działa
  - Faza C: full flow ze sklepem testowym Shopify + Meta sandbox + Google test account; minimum 3 kampanie real-published z $5 budżetem każda

## 12. Roadmap fazowy

Wszystko w jednym specu, ale implementacja w 3 fazach z osobnymi PR-ami:

### Faza A — Broadcast Theme (tydzień 1-3, podzielona na A1 + A2)

Pełen reskin ~45 komponentów (sekcja 5.4) nie zmieści się w 1-2 tygodniach jednego deweloperskiego sprint. Dzielimy:

**Faza A1 (tydzień 1-2): Tokeny + cinematic + hero screens**
- [ ] Tokeny `ui/src/broadcast/tokens.css`
- [ ] Komponenty cinematic (11 z sekcji 5.2) + sekcja w `/design-guide`
- [ ] Reskin **10 hero ekranów** używanych w demo: `Sidebar`, `Layout`, `BreadcrumbBar`, `CompanySwitcher`, `MetricCard`, `AgentBroadcastCard` zastosowane w `Agents` list, `IssueRow`, `KanbanBoard`, `ApprovalCard`, `LiveRunWidget`
- [ ] `data-theme="broadcast"` aplikowany ale za feature flagiem (URL param `?broadcast=1` lub localStorage) — pozwala testować bez ryzyka wpływu na codzienną pracę
- [ ] Reduced-motion pass
- **Deliverable A1**: można puścić demo broadcastu w trybie testowym

**Faza A2 (tydzień 3): Reszta komponentów + włączenie jako default**
- [ ] Pozostałe ~35 komponentów z sekcji 5.4 (Finance*, Goal*, Project*, MobileBottomNav, FilterBar, Comment*, …)
- [ ] Settings page reskin (poziom A2, nie pełny cinematic — tokeny + zaktualizowane prymitywy shadcn)
- [ ] Włącz `data-theme="broadcast"` jako default po pełnym smoke teście (toggle "classic" zostaje schowany za feature flag, na wypadek emergency rollback)
- **Deliverable A2**: cały Paperclip wygląda spójnie cinematic

### Faza B — Live Ops View (tydzień 4)
- [ ] Migracja Drizzle (rozszerzenie `heartbeat_runs` o pola current_*)
- [ ] Backend: enrich heartbeat events z current_thought / current_tool / cost_delta
- [ ] Frontend: `/live`, `/live/:agentId`, sidebar entry
- [ ] Broadcast mode toggle (hero variant)
- [ ] Settings: opcja "Live Ops jako domyślny widok firmy"
- **Deliverable**: można puścić 4 agentów i widać ich live, broadcast mode działa

### Faza C — Marketing AI Plugin (tydzień 5-7)
- [ ] Skeleton pluginu w `packages/plugins/marketing-ai/`
- [ ] Adaptery: meta-ads/auth + meta-ads/campaigns (najpierw create + insights), google-ads analogicznie
- [ ] Creative pipeline: brief + copy + image-composer (Shopify pull + GPT-Image-1)
- [ ] Tools (6 z sekcji 7.2) + plugin SDK registration
- [ ] Approval payload + CampaignApprovalCard + handler approve/reject/revision
- [ ] Widok `/marketing` (CampaignCard, ROASChart, asset library)
- [ ] OAuth flows w settings
- [ ] Audit log + cost cap enforcement
- **Deliverable**: agent prowadzi kampanie sklepu wędkarskiego, real spend, real ROAS w UI

## 13. Open questions (do rozstrzygnięcia przy planowaniu, nie blokujące spec)

- **OQ-1**: Image-composer technologia — sharp + Canvas API w Node, czy zewnętrzny serwis (Bannerbear / Cloudinary)? Default: sharp + Canvas (zero external dependency). Decyzja przy implementacji fazy C.
- **OQ-2**: Storage kreacji — file system Paperclipa (default `~/.paperclip/instances/default/data/creatives/`)? Czy S3-compatible? Default: file system, migracja do S3 jeśli kiedyś multi-tenant.
- **OQ-3**: Brand kit w `Company` table — jako JSON column czy osobna tabela `brand_kits` z relacją? Default: JSON column (`brand_kit_json`), prostsze, zawsze tylko jeden brand per firma.
- **OQ-4**: Sklep wędkarski — Shopify czy inna platforma? Decyzja użytkownika (poza scope specu), ale plugin musi mieć abstrakcję `ShopCatalog` z konkretną implementacją Shopify w pierwszej iteracji.
- **OQ-5**: ~~Cinematic theme jako jedyny czy z toggle "classic"?~~ **Rozstrzygnięte**: cinematic jako jedyny po Fazie A2. Faza A1 trzyma feature flag (URL/localStorage) na okres testów, A2 promuje do default. "Classic" zostaje technicznie dostępny jeszcze 1 release pod feature flagiem na wypadek emergency rollback, potem kasujemy stare tokeny.

## 14. Dependencies (nowe)

```json
{
  "dependencies": {
    "facebook-nodejs-business-sdk": "^19.0.0",
    "google-ads-api": "^17.0.0",
    "sharp": "^0.33.0",
    "@napi-rs/canvas": "^0.1.50"
  }
}
```

OpenAI Images API używa istniejącego `openai` package (jeśli nie ma, dodaj `openai`).

## 15. Migration plan

- **Faza B**: 1 migracja Drizzle rozszerzająca `heartbeat_runs` o `current_thought`, `current_tool`, `current_cost_cents`, `current_thought_updated_at` + 1 nowy index. Brak zmian w `heartbeat_run_events`.
- **Faza C**: 1 migracja tworząca tabele `campaign_proposals`, `creatives`, `marketing_audit_log` + 1 migracja dodająca `brand_kit_json` i `marketing_monthly_cap_pln` na `companies`.
- **No-downtime**: wszystkie zmiany są aditywne, brak DROP/RENAME istniejących kolumn. Nowe kolumny na `heartbeat_runs` mają sensowne defaulty (NULL / 0).
- **Rollback**: każda migracja ma `down()` cofający; przed rollbackiem Fazy C dane kampanii eksportowane do CSV (skrypt `scripts/marketing-export-archive.ts`).

## 16. Out of scope (explicit)

Wymienione razem dla podsumowania:

- Budowa sklepu wędkarskiego (platforma, produkty, fulfillment, płatności)
- Generowanie wideo (tylko statyczne obrazy)
- TikTok / Allegro / LinkedIn Ads (tylko Meta + Google)
- Pełna autonomia agenta (zawsze human approval)
- Multi-tenant agency mode (single tenant)
- Animacje pod cuts wideo (ambient only)
- Reskin Settings / onboarding / debug
- Mobile-first redesign (Mobile zostaje na obecnym poziomie, broadcast theme adaptuje się do mobile ale nie projektujemy nowych mobile flows)

---

**End of spec v1.**
