# Broadcast Edition — Faza A2: Reszta komponentów + Promote to Default

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md](../specs/2026-05-24-paperclip-broadcast-edition-design.md)

**Goal:** Uzupełnić reskin pozostałych ~35 komponentów frontendu, których Faza A1 nie dotknęła, a następnie wypromować `data-theme="broadcast"` do domyślnego — cały Paperclip wygląda cinematic bez żadnych flag.

**Architecture:** Wyłącznie warstwa wizualna (`className`-only, bez zmian w propsach / logice / strukturze JSX). Każda grupa komponentów trafia w jeden commit. Ostatni etap modyfikuje `useBroadcastTheme` tak, że aktywuje temat **domyślnie** (chyba że `?broadcast=0` lub `localStorage.paperclip_broadcast="0"` jawnie wyłączą).

**Tech Stack:** identyczny jak A1 — React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui + Radix, CVA + `cn()` z `@/lib/utils`, Vitest + jsdom. Brak nowych zależności.

---

## File Structure (Faza A2)

**Modyfikowane pliki — komponenty (reskin className-only):**

```
Sidebar sub-components:
  ui/src/components/SidebarNavItem.tsx
  ui/src/components/SidebarSection.tsx
  ui/src/components/SidebarAgents.tsx
  ui/src/components/SidebarProjects.tsx
  ui/src/components/CompanyRail.tsx

Finance & Budget:
  ui/src/components/FinanceTimelineCard.tsx
  ui/src/components/FinanceBillerCard.tsx
  ui/src/components/FinanceKindCard.tsx
  ui/src/components/BillerSpendCard.tsx
  ui/src/components/BudgetPolicyCard.tsx
  ui/src/components/BudgetIncidentCard.tsx

Quota:
  ui/src/components/QuotaBar.tsx
  ui/src/components/ProviderQuotaCard.tsx

Goal:
  ui/src/components/GoalTree.tsx
  ui/src/components/GoalProperties.tsx

Issues (remaining):
  ui/src/components/IssuesList.tsx
  ui/src/components/IssueWorkspaceCard.tsx
  ui/src/components/IssueProperties.tsx

Status & Priority primitives:
  ui/src/components/StatusBadge.tsx
  ui/src/components/StatusIcon.tsx
  ui/src/components/PriorityIcon.tsx

Interaction & UX:
  ui/src/components/EntityRow.tsx
  ui/src/components/FilterBar.tsx
  ui/src/components/EmptyState.tsx
  ui/src/components/PageSkeleton.tsx
  ui/src/components/PageTabBar.tsx
  ui/src/components/MobileBottomNav.tsx
  ui/src/components/CommentThread.tsx

Approvals & Runs:
  ui/src/components/ApprovalPayload.tsx
  ui/src/components/transcript/RunTranscriptView.tsx

Content:
  ui/src/components/MarkdownBody.tsx

Activity & Agents panel:
  ui/src/components/ActiveAgentsPanel.tsx
  ui/src/components/ActivityCharts.tsx
  ui/src/components/ActivityRow.tsx
```

**Modyfikowane pliki — promote to default:**

```
ui/src/broadcast/hooks/useBroadcastTheme.ts        # logika domyślnego włączenia
ui/src/broadcast/hooks/useBroadcastTheme.test.tsx  # rozszerzenie do 8+ testów
```

---

## Conventions for this plan

- **Reskin = className-only**: bez zmian struktury JSX, propsów, logiki. Commit prefiks: `style(broadcast):`.
- **Promote = logika hook + testy**: commit prefiks: `feat(broadcast):`.
- **TDD dla promote task**: test FAIL → implementacja → test PASS — jak w A1 Task 3.
- **Brak nowych zależności**: tylko semantic tokens (`var(--background)`, `text-foreground`, itp.) i istniejące komponenty cinematic z `@/broadcast` (GlowFrame, LiveDot, EqualizerIndicator itp.).
- **`cn()` z `@/lib/utils`** do merge'owania klas — bezpieczny na conditional padding overrides.
- **Test po każdym reskin task**: `pnpm test:run -- --project ui <Pattern>` — weryfikacja że reskin nie złamał istniejących testów.
- **Branch**: `feature/broadcast-a2-rest-default` — tworzony w Task 1 z `master` (po merge A1) albo z `feature/broadcast-a1-tokens-hero` jeśli A1 wciąż pending.

---

## Task 1: Setup branch feature/broadcast-a2-rest-default

**Files:** brak nowych plików.

- [ ] **Step 1: Sprawdź stan A1**

```bash
git log --oneline -5
gh pr list --state open
```

Jeśli A1 jest zmergowany do `master`:
```bash
git checkout master
git pull
git checkout -b feature/broadcast-a2-rest-default
```

Jeśli A1 PR jest wciąż otwarty (nie zmergowany):
```bash
git checkout feature/broadcast-a1-tokens-hero
git pull
git checkout -b feature/broadcast-a2-rest-default
```

- [ ] **Step 2: Weryfikacja że broadcast module jest dostępny**

```bash
pnpm typecheck
```
Expected: zero errors (broadcast module zaimportowany, wszystkie typy rozwiązane).

- [ ] **Step 3: Commit (pusty — tylko branch)**

```bash
git commit --allow-empty -m "feat(broadcast): start A2 — rest reskin + promote to default"
```

---

## Task 2: Reskin Sidebar sub-components (SidebarNavItem, SidebarSection)

`SidebarNavItem` i `SidebarSection` były celowo pominięte w A1 — Sidebar renderuje je wewnętrznie. A2 kończy reskin tych primitywów.

**Files:**
- Modify: `ui/src/components/SidebarNavItem.tsx`
- Modify: `ui/src/components/SidebarSection.tsx`

- [ ] **Step 1: Otwórz oba pliki, zrób inwentaryzację klas**

Szukaj hardkodowanych `bg-gray-*`, `text-gray-*`, `border-gray-*`, `hover:bg-gray-*`. Każde zastąp semantic tokenem.

- [ ] **Step 2: SidebarNavItem — wzorzec klas**

Aktywny item:
```tsx
className={cn(
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
  "text-foreground hover:bg-accent/40",
  active && "bg-accent text-accent-foreground font-medium shadow-[var(--glow-active)]",
)}
```

Ikona nav item: `text-muted-foreground group-hover:text-foreground transition-colors`.

- [ ] **Step 3: SidebarSection — wzorzec klas**

Nagłówek sekcji (label grupy):
```tsx
"px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
```

Separator między sekcjami: `border-border/50`.

- [ ] **Step 4: Run istniejące testy sidebar**

```bash
pnpm test:run -- --project ui Sidebar
```
Expected: PASS (reskin nie dotknął logiki).

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/SidebarNavItem.tsx ui/src/components/SidebarSection.tsx
git commit -m "style(broadcast): reskin SidebarNavItem + SidebarSection"
```

---

## Task 3: Reskin SidebarAgents, SidebarProjects, CompanyRail

Pozostałe komponenty sidebar-owe i szyna firm po lewej. Razem w jednym commicie — są powiązane wizualnie.

**Files:**
- Modify: `ui/src/components/SidebarAgents.tsx`
- Modify: `ui/src/components/SidebarProjects.tsx`
- Modify: `ui/src/components/CompanyRail.tsx`

- [ ] **Step 1: SidebarAgents**

- Awatar agenta: gradient background `var(--grad-agent)` jako fallback gdy brak zdjęcia.
- Status dot przy agencie: zamień ewentualny prosty `bg-green-500` na `<LiveDot status="active" />` z `@/broadcast` — ale TYLKO jeśli nie zmienia to propsów komponentu (jeśli props nie przechodzi status, dodaj tylko klasę koloru).
- Hover na elemencie agenta: `hover:bg-accent/40`.

- [ ] **Step 2: SidebarProjects**

- Ikona projektu: `text-muted-foreground`.
- Aktywny projekt: `bg-accent text-accent-foreground`.
- Hover: `hover:bg-accent/40`.

- [ ] **Step 3: CompanyRail**

CompanyRail to lewa kolumna przełącznika firm (ikony firmowe w pionie).
- Tło szyny: `bg-card border-r border-border`.
- Aktywna firma: `ring-2 ring-primary/60` wokół avatara.
- Hover: `opacity-80 hover:opacity-100 transition-opacity`.
- Avatar firmy (fallback bez logo): `style={{ background: "var(--grad-agent)" }}`.

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev
# Otwórz http://localhost:3100 (broadcast domyślnie po A1, lub ?broadcast=1)
# Sprawdź sidebar: agenci, projekty, szyna firm wyglądają cinematic
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/SidebarAgents.tsx ui/src/components/SidebarProjects.tsx ui/src/components/CompanyRail.tsx
git commit -m "style(broadcast): reskin SidebarAgents + SidebarProjects + CompanyRail"
```

---

## Task 4: Reskin Finance* i Budget* (6 komponentów)

Karty finansowe i budżetowe — dominują na stronie `/costs`. Razem bo używają podobnych wzorców.

**Files:**
- Modify: `ui/src/components/FinanceTimelineCard.tsx`
- Modify: `ui/src/components/FinanceBillerCard.tsx`
- Modify: `ui/src/components/FinanceKindCard.tsx`
- Modify: `ui/src/components/BillerSpendCard.tsx`
- Modify: `ui/src/components/BudgetPolicyCard.tsx`
- Modify: `ui/src/components/BudgetIncidentCard.tsx`

- [ ] **Step 1: Otwórz każdy plik, inwentaryzacja klas**

Szukaj: hardkodowane kolory (`bg-blue-*`, `text-green-*`, `border-red-*`), shadow.

- [ ] **Step 2: Wspólne wzorce dla kart finansowych**

Każda karta:
```tsx
// Wrapper karty — semantic, z subtelnym glow na hover
<div className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-[var(--glow-active)]">
```

Wartości kwot (np. spend, budget):
```tsx
// Gradient text dla kwot pieniężnych
<span
  className="text-xl font-extrabold leading-none"
  style={{
    background: "var(--grad-cost)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  }}
>
  {formattedValue}
</span>
```

Alerty budżetowe (incident/warning):
```tsx
// BudgetIncidentCard: GlowFrame state="warning"
<GlowFrame state="warning" className="p-4">
```

Polityka budżetowa (BudgetPolicyCard): `GlowFrame state="idle"`.

- [ ] **Step 3: FinanceTimelineCard**

Oś czasu: separator linia `border-border/40`, eventy `bg-muted/60 rounded-md`.

- [ ] **Step 4: BillerSpendCard**

Pasek wydatków (jeśli istnieje wbudowany progress): podmień na `bg-muted` track + gradient fill `style={{ background: "var(--grad-cost)" }}` — analogicznie do XPBar z broadcast.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/FinanceTimelineCard.tsx ui/src/components/FinanceBillerCard.tsx ui/src/components/FinanceKindCard.tsx ui/src/components/BillerSpendCard.tsx ui/src/components/BudgetPolicyCard.tsx ui/src/components/BudgetIncidentCard.tsx
git commit -m "style(broadcast): reskin Finance* and Budget* cards"
```

---

## Task 5: Reskin Quota (QuotaBar, ProviderQuotaCard)

**Files:**
- Modify: `ui/src/components/QuotaBar.tsx`
- Modify: `ui/src/components/ProviderQuotaCard.tsx`

- [ ] **Step 1: QuotaBar**

QuotaBar to pasek zużycia API quota. Wzorzec identyczny jak XPBar z broadcast module:
- Track: `bg-muted rounded-full overflow-hidden`
- Fill: gradient z `var(--xp-bar-fill)` (ten sam gradient co XP — pasuje semantycznie)
- Tekst etykiety: `text-muted-foreground text-xs uppercase tracking-wide`
- Gdy quota krytyczna (>90%): fill w `var(--glow-error)` kolor (czerwony), track z `border border-red-500/30`

Implementacja: otwórz plik, zidentyfikuj element fill paska, zaktualizuj tylko `className` i ewentualny `style`.

- [ ] **Step 2: ProviderQuotaCard**

Karta dostawcy quota (per model / per provider).
- Wrapper: `rounded-lg border border-border bg-card p-3`
- Nazwa dostawcy: `text-sm font-semibold text-foreground`
- Metadane (model, tier): `text-xs text-muted-foreground`
- QuotaBar wewnątrz: po Task 5 Step 1 już wygląda dobrze

- [ ] **Step 3: Typecheck + smoke**

```bash
pnpm typecheck
# Otwórz /costs lub stronę z quota kartami
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/QuotaBar.tsx ui/src/components/ProviderQuotaCard.tsx
git commit -m "style(broadcast): reskin QuotaBar + ProviderQuotaCard"
```

---

## Task 6: Reskin Goal* (GoalTree, GoalProperties)

**Files:**
- Modify: `ui/src/components/GoalTree.tsx`
- Modify: `ui/src/components/GoalProperties.tsx`

- [ ] **Step 1: GoalTree**

GoalTree renderuje drzewo celów (hierarchia). Wzorce do zaktualizowania:
- Linie łączące węzły: `border-border/40`
- Węzeł celu: `rounded-md border border-border bg-card px-2 py-1.5 text-sm hover:bg-accent/40 transition-colors`
- Aktywny/zaznaczony węzeł: `bg-accent text-accent-foreground shadow-[var(--glow-active)]`
- Ikona statusu celu: `text-primary` (zamień hardkodowane kolory ikon)
- Procent ukończenia (jeśli wyświetlany): gradient text jak w MetricCard z A1

- [ ] **Step 2: GoalProperties**

Panel właściwości celu (sidebar/panel po prawej przy zaznaczeniu).
- Tło panelu: `bg-card border-l border-border`
- Nagłówki sekcji: `text-xs font-semibold uppercase tracking-widest text-muted-foreground/70`
- Wartości pól: `text-sm text-foreground`
- Separatory: `border-border/50`

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/GoalTree.tsx ui/src/components/GoalProperties.tsx
git commit -m "style(broadcast): reskin GoalTree + GoalProperties"
```

---

## Task 7: Reskin Issues (IssuesList, IssueWorkspaceCard, IssueProperties)

`IssueRow` był w A1 — teraz dopełniamy pozostałe komponenty issue.

**Files:**
- Modify: `ui/src/components/IssuesList.tsx`
- Modify: `ui/src/components/IssueWorkspaceCard.tsx`
- Modify: `ui/src/components/IssueProperties.tsx`

- [ ] **Step 1: IssuesList**

Lista issue (kontener). Wzorce:
- Wrapper: `divide-y divide-border` (zamiast hardkodowanego dividera)
- Header (sortowanie, filtry): `bg-background/80 backdrop-blur-sm sticky top-0 border-b border-border`
- Empty state (jeśli wbudowany): podmień na `EmptyState` z A2 Task 9 po jego wykonaniu; tymczasowo: `text-muted-foreground text-sm`

- [ ] **Step 2: IssueWorkspaceCard**

Karta issue w widoku workspace (compact karta z nazwą + statusem).
- Tło: `bg-card border border-border rounded-lg`
- Hover: `hover:bg-accent/40 transition-colors`
- Status badge wewnątrz: korzysta z `StatusBadge` (reskinowanego w Task 8)

- [ ] **Step 3: IssueProperties**

Analogicznie do GoalProperties:
- Tło panelu: `bg-card border-l border-border`
- Nagłówki: `text-xs font-semibold uppercase tracking-widest text-muted-foreground/70`
- Separatory: `border-border/50`

- [ ] **Step 4: Run istniejące testy**

```bash
pnpm test:run -- --project ui IssueRow
pnpm test:run -- --project ui IssuesList
```
Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/IssuesList.tsx ui/src/components/IssueWorkspaceCard.tsx ui/src/components/IssueProperties.tsx
git commit -m "style(broadcast): reskin IssuesList + IssueWorkspaceCard + IssueProperties"
```

---

## Task 8: Reskin StatusBadge, StatusIcon, PriorityIcon

Primitive'y używane przez niemal każdy komponent w systemie — kluczowe dla spójności.

**Files:**
- Modify: `ui/src/components/StatusBadge.tsx`
- Modify: `ui/src/components/StatusIcon.tsx`
- Modify: `ui/src/components/PriorityIcon.tsx`

- [ ] **Step 1: StatusBadge**

StatusBadge używa CVA (spec A1 wskazał go jako referencję). Zaktualizuj warianty, żeby używały semantic tokenów broadcast:

Wzorzec dla wariantów:
```tsx
// Zamiast hardkodowanych bg-green-100 text-green-800:
done: "bg-green-500/15 text-green-400 border border-green-500/25",
inProgress: "bg-primary/15 text-primary border border-primary/25",
blocked: "bg-red-500/15 text-red-400 border border-red-500/25",
todo: "bg-muted text-muted-foreground border border-border",
cancelled: "bg-muted/60 text-muted-foreground/60 border border-border/40",
```

Utrzymaj identyczne nazwy wariantów CVA — zmień tylko wartości klas.

- [ ] **Step 2: StatusIcon**

StatusIcon to ikona Lucide lub SVG per stan. Zaktualizuj kolory ikon:
```tsx
// Zamiast hardkodowanych fill-green-500, text-red-600:
done: "text-green-400",
inProgress: "text-primary",
blocked: "text-red-400",
todo: "text-muted-foreground",
cancelled: "text-muted-foreground/50",
```

- [ ] **Step 3: PriorityIcon**

Analogicznie — zamień hardkodowane kolory priorytetów na semantic tokens:
```tsx
urgent: "text-red-400",
high: "text-amber-400",
medium: "text-primary",
low: "text-muted-foreground",
none: "text-muted-foreground/40",
```

- [ ] **Step 4: Run testy**

```bash
pnpm test:run -- --project ui StatusBadge
pnpm test:run -- --project ui IssueRow
```
Expected: PASS (IssueRow zależy od tych primitywów — sprawdza regresję).

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/StatusBadge.tsx ui/src/components/StatusIcon.tsx ui/src/components/PriorityIcon.tsx
git commit -m "style(broadcast): reskin StatusBadge + StatusIcon + PriorityIcon"
```

---

## Task 9: Reskin EntityRow, FilterBar, EmptyState, PageSkeleton, PageTabBar, MobileBottomNav

Komponenty UX — używane na wielu stronach.

**Files:**
- Modify: `ui/src/components/EntityRow.tsx`
- Modify: `ui/src/components/FilterBar.tsx`
- Modify: `ui/src/components/EmptyState.tsx`
- Modify: `ui/src/components/PageSkeleton.tsx`
- Modify: `ui/src/components/PageTabBar.tsx`
- Modify: `ui/src/components/MobileBottomNav.tsx`

- [ ] **Step 1: EntityRow**

Generyczny rząd encji (używany przez wiele list). Wzorzec jak IssueRow z A1:
- `bg-card hover:bg-accent/40 transition-colors border-b border-border`
- Aktywny: `bg-accent/60`

- [ ] **Step 2: FilterBar**

Pasek filtrów (dropdown + search + sortowanie).
- Tło: `bg-background/80 backdrop-blur-sm border-b border-border`
- Przyciski filtrów: `rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent/40 transition-colors`
- Aktywny filtr: `bg-primary/15 text-primary border-primary/30`
- Input search: `bg-muted border-border focus:ring-1 focus:ring-primary/40`

- [ ] **Step 3: EmptyState**

Pusty stan — centrowany komunikat bez danych.
- Ikona: `text-muted-foreground/40` (większa, np. size-12)
- Tytuł: `text-base font-medium text-foreground`
- Opis: `text-sm text-muted-foreground`
- CTA button (jeśli jest): `variant="outline"` z `border-border hover:bg-accent/40`

- [ ] **Step 4: PageSkeleton**

Skeleton loading — animowane placeholdery.
- Skeleton blocks: `bg-muted/60 animate-pulse rounded-md`
- Upewnij się że `@media (prefers-reduced-motion)` wyłącza `animate-pulse` — dodaj `motion-safe:animate-pulse` jeśli Tailwind v4 to wspiera, lub inline `@media` wrapper.

- [ ] **Step 5: PageTabBar**

Taby nawigacyjne w obrębie strony (np. Issues → Board / List / Backlog).
- Tło tab bar: `border-b border-border bg-background/80 backdrop-blur-sm`
- Nieaktywna karta: `text-muted-foreground hover:text-foreground transition-colors px-3 py-2 text-sm`
- Aktywna karta: `text-foreground border-b-2 border-primary font-medium`

- [ ] **Step 6: MobileBottomNav**

Dolna nawigacja mobilna (widoczna na wąskich ekranach).
- Tło: `bg-card border-t border-border`
- Ikony: `text-muted-foreground`
- Aktywna: `text-primary` + opcjonalny `shadow-[var(--glow-active)]` na ikonie

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add ui/src/components/EntityRow.tsx ui/src/components/FilterBar.tsx ui/src/components/EmptyState.tsx ui/src/components/PageSkeleton.tsx ui/src/components/PageTabBar.tsx ui/src/components/MobileBottomNav.tsx
git commit -m "style(broadcast): reskin EntityRow + FilterBar + EmptyState + PageSkeleton + PageTabBar + MobileBottomNav"
```

---

## Task 10: Reskin CommentThread

**Files:**
- Modify: `ui/src/components/CommentThread.tsx`

- [ ] **Step 1: Otwórz plik, inwentaryzacja**

Szukaj: hardkodowane kolory avatarów, bubble komentarzy, separatory czasu.

- [ ] **Step 2: Zaktualizuj klasy**

Avatar autora (fallback bez zdjęcia):
```tsx
style={{ background: "var(--grad-agent)" }}
className="rounded-full text-white font-bold"
```

Bubble komentarza:
```tsx
"rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground"
```

Własny komentarz (current user):
```tsx
"rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm"
```

Timestamp: `text-[10px] text-muted-foreground/60`

Input nowego komentarza: `bg-muted border border-border focus:ring-1 focus:ring-primary/40 rounded-md`

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/CommentThread.tsx
git commit -m "style(broadcast): reskin CommentThread"
```

---

## Task 11: Reskin ApprovalPayload, RunTranscriptView, MarkdownBody

Pozostałe komponenty approvals i transcript.

**Files:**
- Modify: `ui/src/components/ApprovalPayload.tsx`
- Modify: `ui/src/components/transcript/RunTranscriptView.tsx`
- Modify: `ui/src/components/MarkdownBody.tsx`

- [ ] **Step 1: ApprovalPayload**

Payload wyświetlany wewnątrz ApprovalCard (po A1 ApprovalCard już ma `GlowFrame state="warning"`). ApprovalPayload to treść — JSON/structured data:
- Kontener: `rounded-md bg-muted/40 border border-border p-3 font-mono text-xs`
- Klucze JSON: `text-primary`
- Wartości string: `text-green-400`
- Wartości boolean/null: `text-amber-400`

- [ ] **Step 2: RunTranscriptView**

Widok transkryptu runa agenta (`ui/src/components/transcript/RunTranscriptView.tsx`).
- Kontener zewnętrzny: `bg-background border border-border rounded-lg`
- Linia transkryptu (tool call): `font-mono text-xs bg-muted/40 px-3 py-1.5 border-l-2 border-primary/50`
- Linia transkryptu (assistant message): `text-sm text-foreground px-3 py-2`
- Linia transkryptu (user message): `text-sm text-muted-foreground px-3 py-2 bg-muted/20`
- Timestamp: `text-[10px] text-muted-foreground/50 font-mono`

- [ ] **Step 3: MarkdownBody**

MarkdownBody renderuje przetworzone Markdown. Główne zmiany to tailwind prose klasy + broadcast overridy:
```tsx
// Dodaj/zaktualizuj className prose:
"prose prose-invert max-w-none text-foreground"
// + broadcast overridy dla headings, links, code blocks:
"[&_h1]:text-foreground [&_h2]:text-foreground"
"[&_a]:text-primary [&_a:hover]:text-primary/80"
"[&_code]:bg-muted [&_code]:text-cyan-400 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs"
"[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg"
"[&_blockquote]:border-l-primary/60 [&_blockquote]:text-muted-foreground"
```

- [ ] **Step 4: Run istniejące testy**

```bash
pnpm test:run -- --project ui RunTranscriptView
pnpm test:run -- --project ui MarkdownBody
```
Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/ApprovalPayload.tsx ui/src/components/transcript/RunTranscriptView.tsx ui/src/components/MarkdownBody.tsx
git commit -m "style(broadcast): reskin ApprovalPayload + RunTranscriptView + MarkdownBody"
```

---

## Task 12: Reskin ActiveAgentsPanel, ActivityCharts, ActivityRow

Ostatnia grupa komponentów — panel aktywnych agentów i dashboard activity.

**Files:**
- Modify: `ui/src/components/ActiveAgentsPanel.tsx`
- Modify: `ui/src/components/ActivityCharts.tsx`
- Modify: `ui/src/components/ActivityRow.tsx`

- [ ] **Step 1: ActiveAgentsPanel**

Panel z aktywnymi agentami (widget w sidebarze lub na dashboardzie).
- Wrapper: `rounded-lg border border-border bg-card`
- Nagłówek: `px-3 py-2 border-b border-border flex items-center justify-between`
- Tytuł nagłówka: `text-xs font-semibold uppercase tracking-widest text-muted-foreground/70`
- Lista agentów wewnątrz: każdy agent z `<LiveDot status="active" pulse />` z `@/broadcast` + avatar z gradient `var(--grad-agent)`
- Status "brak aktywnych": `text-xs text-muted-foreground/60 text-center py-4`

- [ ] **Step 2: ActivityCharts**

Wykresy aktywności (prawdopodobnie Recharts lub custom SVG).
- Tło wykresu / obszar: `bg-transparent`
- Siatka / grid lines: `stroke="var(--border)"` lub Tailwind `[&_.recharts-cartesian-grid-horizontal_line]:stroke-border`
- Oś X/Y labels: `fill="var(--muted-foreground)"` / `text-muted-foreground text-[10px]`
- Linia/bar wykresu (main data): `stroke` lub `fill` używając wartości `oklch(0.65 0.18 220)` (primary broadcast) — uwaga: Recharts nie czyta CSS variables bezpośrednio, możliwe że trzeba użyć `getComputedStyle` lub hardkodować OKLCH wartość jako string `"oklch(0.65 0.18 220)"`.
- Tooltip: `bg-card border border-border text-foreground text-xs rounded-md shadow-lg`

- [ ] **Step 3: ActivityRow**

Rząd zdarzenia w logu aktywności.
- Tło: `hover:bg-accent/40 transition-colors`
- Ikona aktywności: `text-muted-foreground`
- Opis zdarzenia: `text-sm text-foreground`
- Timestamp: `text-xs text-muted-foreground/60`
- Separator: `border-b border-border/50 last:border-0`

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/ActiveAgentsPanel.tsx ui/src/components/ActivityCharts.tsx ui/src/components/ActivityRow.tsx
git commit -m "style(broadcast): reskin ActiveAgentsPanel + ActivityCharts + ActivityRow"
```

---

## Task 13: Promote data-theme="broadcast" do default (TDD)

Po reskinach wszystkich komponentów: `useBroadcastTheme` zmienia strategię — **broadcast ON domyślnie**, wyłączalne przez `?broadcast=0` lub `localStorage`.

**Files:**
- Modify: `ui/src/broadcast/hooks/useBroadcastTheme.ts`
- Modify: `ui/src/broadcast/hooks/useBroadcastTheme.test.tsx`

- [ ] **Step 1: Napisz nowe failing testy (rozszerz plik testowy)**

Zastąp zawartość `useBroadcastTheme.test.tsx` nową wersją obejmującą stare + nowe przypadki:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBroadcastTheme } from "./useBroadcastTheme";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useBroadcastTheme();
  return null;
}

describe("useBroadcastTheme — promote to default (A2)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    container.remove();
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  // --- DEFAULT ON (A2 nowe testy) ---

  it("applies broadcast theme by default when no flag is set", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("does NOT apply broadcast theme when ?broadcast=0 in URL", () => {
    window.history.replaceState({}, "", "/?broadcast=0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("persists broadcast=0 to localStorage when ?broadcast=0 in URL", () => {
    window.history.replaceState({}, "", "/?broadcast=0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("0");
  });

  it("does NOT apply broadcast theme when localStorage.paperclip_broadcast is '0'", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("URL ?broadcast=1 overrides localStorage '0' and applies theme", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("?broadcast=1 removes '0' override in localStorage", () => {
    localStorage.setItem("paperclip_broadcast", "0");
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("1");
  });

  it("removes data-theme attribute (does not leave stale broadcast) when disabled via localStorage", () => {
    // Pre-set attribute to simulate previous render with theme on
    document.documentElement.setAttribute("data-theme", "broadcast");
    localStorage.setItem("paperclip_broadcast", "0");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("applies broadcast theme when localStorage is '1' (explicit enable)", () => {
    localStorage.setItem("paperclip_broadcast", "1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });
});
```

- [ ] **Step 2: Run testy, verify FAIL**

```bash
pnpm test:run -- --project ui useBroadcastTheme
```
Expected: 4 stare testy (A1 semantyka) FAILują lub PASS, ale 4+ nowych FAILuje — w szczególności "applies broadcast theme by default" i "?broadcast=0 disables".

- [ ] **Step 3: Zaktualizuj implementację useBroadcastTheme.ts**

Nowa implementacja (zastąp cały plik):

```ts
import { useEffect } from "react";

const STORAGE_KEY = "paperclip_broadcast";
const URL_PARAM = "broadcast";

/**
 * Reads current broadcast preference.
 * Returns true (enable) unless explicitly disabled via URL or localStorage.
 *
 * Priority (highest → lowest):
 *   1. URL ?broadcast=1  → true  (and persists "1" to localStorage)
 *   2. URL ?broadcast=0  → false (and persists "0" to localStorage)
 *   3. localStorage "0"  → false
 *   4. (default)         → true
 */
function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const url = new URL(window.location.href);
  const param = url.searchParams.get(URL_PARAM);
  if (param === "1") return true;
  if (param === "0") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "0") return false;
  return true; // default ON
}

/**
 * If a ?broadcast=0 or ?broadcast=1 param is present in the URL,
 * persist it to localStorage so the preference survives navigation.
 */
function persistFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const param = url.searchParams.get(URL_PARAM);
  if (param === "1") {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } else if (param === "0") {
    window.localStorage.setItem(STORAGE_KEY, "0");
  }
}

export function useBroadcastTheme(): void {
  useEffect(() => {
    persistFromUrl();
    if (readEnabled()) {
      document.documentElement.setAttribute("data-theme", "broadcast");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);
}
```

- [ ] **Step 4: Run testy, verify PASS**

```bash
pnpm test:run -- --project ui useBroadcastTheme
```
Expected: wszystkie 8 testów PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 6: Manual smoke**

```bash
pnpm dev
```

Scenariusze do ręcznego sprawdzenia:
- `http://localhost:3100` (bez flagi) → `<html data-theme="broadcast">` w DevTools. Aplikacja wygląda cinematic.
- `http://localhost:3100?broadcast=0` → atrybut `data-theme` zniknął. `localStorage.paperclip_broadcast` = `"0"`.
- Odśwież `http://localhost:3100` (bez flagi) → temat NADAL wyłączony (localStorage persystuje `"0"`).
- `http://localhost:3100?broadcast=1` → atrybut wraca. `localStorage` = `"1"`.
- Odśwież bez flagi → temat wciąż włączony (localStorage `"1"`).
- `localStorage.clear()` + reload → broadcast domyślnie włączony.

- [ ] **Step 7: Commit**

```bash
git add ui/src/broadcast/hooks/useBroadcastTheme.ts ui/src/broadcast/hooks/useBroadcastTheme.test.tsx
git commit -m "feat(broadcast): promote data-theme=broadcast to default; ?broadcast=0 for rollback"
```

---

## Task 14: Pełny test pass + smoke checklist

**Files:** brak — weryfikacja.

- [ ] **Step 1: Pełen typecheck całego repo**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 2: Pełen test UI**

```bash
pnpm test:run -- --project ui
```
Expected: wszystkie testy PASS. Jeśli jakiś FAIL — napraw w osobnym commicie z opisem problemu przed przejściem do Step 3.

- [ ] **Step 3: Smoke checklist (uruchom `pnpm dev`)**

Wejdź na `http://localhost:3100` (bez żadnej flagi — broadcast domyślnie):

**Sidebar & nawigacja:**
- [ ] Sidebar + SidebarNavItem wyglądają cinematic; aktywny item ma glow.
- [ ] SidebarAgents: agenci z gradient avatar.
- [ ] SidebarProjects: projekty z semantic hover.
- [ ] CompanyRail: aktywna firma z `ring-2 ring-primary/60`.

**Finance & Budget:**
- [ ] Strona `/costs` — FinanceTimelineCard, FinanceBillerCard, FinanceKindCard, BillerSpendCard mają gradient na kwotach.
- [ ] BudgetPolicyCard: `GlowFrame state="idle"`.
- [ ] BudgetIncidentCard: `GlowFrame state="warning"`.

**Quota:**
- [ ] QuotaBar ma gradient fill.
- [ ] ProviderQuotaCard wygląda spójnie.

**Goals:**
- [ ] GoalTree: węzły z semantic hover, aktywny z glow.
- [ ] GoalProperties: panel z broadcast tokenami.

**Issues:**
- [ ] IssuesList, IssueWorkspaceCard, IssueProperties — spójne.
- [ ] StatusBadge w różnych stanach używa semantic tokenów (nie hardkodowane kolory).
- [ ] PriorityIcon kolorystycznie pasuje.

**UX primitives:**
- [ ] EmptyState renderuje się czysto na pustych listach.
- [ ] PageSkeleton animate-pulse widoczny (i wyłączony w DevTools `prefers-reduced-motion: reduce`).
- [ ] PageTabBar: aktywna karta z `border-b-2 border-primary`.
- [ ] FilterBar: przyciski filtrów z semantic tokens.
- [ ] MobileBottomNav: widoczny na wąskich ekranach (DevTools → urządzenie mobilne).

**Comments & Approvals:**
- [ ] CommentThread: bubble'y komentarzy z muted tłem.
- [ ] ApprovalPayload: JSON display w monospace z kolorowymi kluczami.

**Transcript & Markdown:**
- [ ] RunTranscriptView: linie tool call z border-l primary.
- [ ] MarkdownBody: code inline w `cyan-400`, bloki kodu z `bg-muted`.

**Activity & Agents:**
- [ ] ActiveAgentsPanel: LiveDot pulse przy aktywnych agentach.
- [ ] ActivityRow: hover bg-accent.

**Promote default:**
- [ ] Bez żadnych flag w URL i czystym localStorage → broadcast jest włączony.
- [ ] `?broadcast=0` → broadcast off, strona klasyczna.
- [ ] `localStorage.paperclip_broadcast = "0"` + reload → broadcast off.
- [ ] `?broadcast=1` → broadcast on, localStorage zaktualizowany na "1".
- [ ] `prefers-reduced-motion: reduce` w DevTools → animacje wyłączone, layout intact.

- [ ] **Step 4: Fix jeśli cokolwiek nie gra**

Każdy fix jako oddzielny commit z opisowym message.

---

## Task 15: Push branch + otwórz PR

**Files:** brak — git operations.

- [ ] **Step 1: Final checks**

```bash
pnpm typecheck
pnpm test:run -- --project ui
```
Expected: zero errors, wszystkie testy PASS.

- [ ] **Step 2: Push**

```bash
git push -u origin feature/broadcast-a2-rest-default
```

- [ ] **Step 3: Otwórz PR**

```bash
gh pr create \
  --title "feat(broadcast): A2 — rest reskin (~35 components) + promote broadcast to default" \
  --body "$(cat <<'EOF'
## Summary

Faza A2 Broadcast Edition — dokończenie reskinu i włączenie motywu jako domyślnego.

### Co zmieniono

**Reskin (className-only, ~35 komponentów):**
- Sidebar sub-components: SidebarNavItem, SidebarSection, SidebarAgents, SidebarProjects, CompanyRail
- Finance & Budget: FinanceTimelineCard, FinanceBillerCard, FinanceKindCard, BillerSpendCard, BudgetPolicyCard, BudgetIncidentCard
- Quota: QuotaBar, ProviderQuotaCard
- Goal: GoalTree, GoalProperties
- Issues: IssuesList, IssueWorkspaceCard, IssueProperties
- Status & Priority primitives: StatusBadge, StatusIcon, PriorityIcon
- UX: EntityRow, FilterBar, EmptyState, PageSkeleton, PageTabBar, MobileBottomNav, CommentThread
- Approvals & Runs: ApprovalPayload, RunTranscriptView
- Content: MarkdownBody
- Activity & Agents panel: ActiveAgentsPanel, ActivityCharts, ActivityRow

**Promote to default:**
- \`useBroadcastTheme\` aplikuje \`data-theme="broadcast"\` domyślnie
- Rollback: \`?broadcast=0\` lub \`localStorage.paperclip_broadcast="0"\` wyłącza motyw
- \`?broadcast=1\` przywraca i nadpisuje localStorage
- 8 testów pokrywa wszystkie scenariusze flag

### Spec

[docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md](../docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md) — sekcja 5.4 + OQ-5

### Test plan

- [ ] \`pnpm typecheck\` — zero errors
- [ ] \`pnpm test:run -- --project ui\` — wszystkie testy PASS
- [ ] Manual smoke: każda sekcja z checklisty Task 14 Step 3
- [ ] Weryfikacja rollback: \`?broadcast=0\` wyłącza motyw
- [ ] Weryfikacja \`prefers-reduced-motion\`: animacje wyłączone

EOF
)"
```

- [ ] **Step 4: Zapisz URL PR**

```bash
gh pr view --web
```

---

## Post-A2

Po merge'u A1 + A2 cały Paperclip jest reskinowany i broadcasting domyślnie. Kolejne kroki:

- **Faza B** (`docs/superpowers/plans/2026-05-24-broadcast-b-live-ops.md`) — widok `/live`, Live Ops grid, backend rozszerzenie `heartbeat_runs`, stream danych per-agent.
- **Faza C** — Marketing AI Plugin (osobny plan).
- **Cleanup A**: po 1-2 tygodniach stabilnej pracy z broadcast jako default → usuń stary `?broadcast=1` fallback, posprzątaj starą gałąź tokens (opcjonalne).

---

**Koniec planu Faza A2.**
