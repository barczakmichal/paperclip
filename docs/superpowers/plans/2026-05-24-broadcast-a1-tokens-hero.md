# Broadcast Edition — Faza A1: Tokens, Cinematic Components, Hero Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-24-paperclip-broadcast-edition-design.md](../specs/2026-05-24-paperclip-broadcast-edition-design.md)

**Goal:** Wprowadzić warstwę "Broadcast Theme" w Paperclipie — nowe tokeny CSS, 11 cinematic komponentów React, reskin 10 hero ekranów, feature flag do bezpiecznego testowania.

**Architecture:** Nowy folder `ui/src/broadcast/` z tokenami CSS i komponentami. Tokeny załadowane przez `import` w `index.css`; aktywacja przez `data-theme="broadcast"` na `<html>` ustawiane przez hook `useBroadcastTheme()` z feature flagiem (`?broadcast=1` lub `localStorage.paperclip_broadcast = "1"`). Nowe komponenty używają CVA dla wariantów, `cn()` do merge'owania klas, i tylko semantycznych tokenów CSS. Reskin hero screens nie podmienia logiki — tylko warstwę wizualną (klasy Tailwind + użycie nowych komponentów cinematic gdzie pasuje).

**Tech Stack:**
- React 19 + TypeScript + Vite
- Tailwind CSS v4 (OKLCH, custom variables)
- shadcn/ui + Radix UI + Lucide icons
- class-variance-authority (CVA), clsx + tailwind-merge przez `cn()`
- Vitest + jsdom dla testów (konwencja: `Component.test.tsx` obok komponentu, manual `createRoot` + `act`, vide ui/src/components/IssueRow.test.tsx)

---

## File Structure (Faza A1)

**Nowe pliki:**

```
ui/src/broadcast/
├── tokens.css                              # nowe CSS variables broadcast
├── hooks/
│   └── useBroadcastTheme.ts                # feature flag + data-theme apply
├── components/
│   ├── GlowFrame.tsx
│   ├── GlowFrame.test.tsx
│   ├── LiveDot.tsx
│   ├── LiveDot.test.tsx
│   ├── LevelBadge.tsx
│   ├── LevelBadge.test.tsx
│   ├── StreakBadge.tsx
│   ├── StreakBadge.test.tsx
│   ├── XPBar.tsx
│   ├── XPBar.test.tsx
│   ├── EqualizerIndicator.tsx
│   ├── EqualizerIndicator.test.tsx
│   ├── CostTicker.tsx
│   ├── CostTicker.test.tsx
│   ├── PlatformBadge.tsx
│   ├── PlatformBadge.test.tsx
│   ├── ThoughtStream.tsx
│   ├── ThoughtStream.test.tsx
│   ├── MissionCard.tsx
│   ├── MissionCard.test.tsx
│   ├── AgentBroadcastCard.tsx
│   ├── AgentBroadcastCard.test.tsx
│   └── index.ts                            # barrel export
└── index.ts                                # publiczny entry: hooks + components
```

**Modyfikowane pliki:**

- `ui/src/index.css` — `@import "./broadcast/tokens.css";`
- `ui/src/main.tsx` lub `ui/src/App.tsx` — wywołanie `useBroadcastTheme()` na root
- `ui/src/pages/DesignGuide.tsx` — dodanie sekcji "Broadcast" demonstrującej każdy komponent
- 10 hero komponentów (sekcje 5.4 specu — tylko najpilniejsze pod demo):
  - `ui/src/components/Sidebar.tsx`
  - `ui/src/components/Layout.tsx`
  - `ui/src/components/BreadcrumbBar.tsx`
  - `ui/src/components/CompanySwitcher.tsx`
  - `ui/src/components/MetricCard.tsx`
  - `ui/src/components/IssueRow.tsx`
  - `ui/src/components/KanbanBoard.tsx`
  - `ui/src/components/ApprovalCard.tsx`
  - `ui/src/components/LiveRunWidget.tsx`
  - `ui/src/pages/Agents.tsx` (lub equivalent listy agentów — sprawdź podczas implementacji)

---

## Conventions for this plan

- **TDD**: każdy komponent ma test przed implementacją; testy uruchamiamy `pnpm --filter @paperclipai/ui test:run -- ComponentName.test`
- **Commit po każdym Tasku**: dyscyplina, pozwala bisect; commity prefixujemy `feat(broadcast):` lub `style(broadcast):`
- **Brak `any`**: TypeScript strict; jeśli musisz, użyj `unknown` i zawężaj
- **Brak hardkodowanych kolorów**: tylko semantic tokens (`var(--background)`, `text-foreground`, itp.); nowe tokeny broadcast w `tokens.css`
- **CVA wzorzec**: użyj jak w `ui/src/components/StatusBadge.tsx` (zerknij na implementację jako referencję dla wariantów)
- **Reduced motion**: każda animacja owinięta w `@media (prefers-reduced-motion: reduce)` z definicją statycznego fallback
- **Branch**: `feature/broadcast-a1-tokens-hero` (Task 1)

---

## Task 1: Setup branch i struktura katalogu broadcast

**Files:**
- Create: `ui/src/broadcast/index.ts`
- Create: `ui/src/broadcast/components/index.ts`
- Create: `ui/src/broadcast/hooks/.gitkeep`

- [ ] **Step 1: Stwórz branch**

```bash
git checkout -b feature/broadcast-a1-tokens-hero
```

- [ ] **Step 2: Stwórz puste pliki barrel**

Plik `ui/src/broadcast/index.ts`:
```ts
// Public entry for the Broadcast theme module.
// Re-exports tokens hook and cinematic components.
export * from "./components";
export { useBroadcastTheme } from "./hooks/useBroadcastTheme";
```

Plik `ui/src/broadcast/components/index.ts`:
```ts
// Barrel export for cinematic components. Filled in as components are added.
export {};
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/broadcast/
git commit -m "feat(broadcast): scaffold broadcast module directory"
```

Expected: 1 new commit, 3 plików nieskompilowanych (ale puste exporty są OK).

---

## Task 2: Tokens broadcast w CSS

**Files:**
- Create: `ui/src/broadcast/tokens.css`
- Modify: `ui/src/index.css` (jeden `@import` na końcu)

- [ ] **Step 1: Stwórz plik tokenów**

Plik `ui/src/broadcast/tokens.css`:
```css
/* Broadcast theme tokens.
 * Activated by setting data-theme="broadcast" on the html element
 * (see ui/src/broadcast/hooks/useBroadcastTheme.ts).
 * Overrides base tokens from index.css and adds new gradients/glows/gamification.
 */
:root[data-theme="broadcast"] {
  /* Bazowe overridy istniejących tokenów (głębsza czerń, mocniejszy kontrast) */
  --background: oklch(0.08 0 0);
  --foreground: oklch(0.98 0 0);
  --card: oklch(0.11 0 0);
  --card-foreground: oklch(0.98 0 0);
  --popover: oklch(0.11 0 0);
  --popover-foreground: oklch(0.98 0 0);
  --primary: oklch(0.85 0.16 220);
  --primary-foreground: oklch(0.08 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.65 0 0);
  --accent: oklch(0.20 0.04 240);
  --accent-foreground: oklch(0.98 0 0);
  --border: oklch(0.18 0 0);
  --input: oklch(0.18 0 0);
  --ring: oklch(0.85 0.16 220);

  /* Nowe tokeny gradientów cinematic */
  --grad-agent: linear-gradient(135deg, oklch(0.65 0.18 220), oklch(0.55 0.16 200));
  --grad-marketing: linear-gradient(135deg, oklch(0.70 0.20 60), oklch(0.60 0.22 30));
  --grad-engineering: linear-gradient(135deg, oklch(0.65 0.20 280), oklch(0.55 0.18 260));
  --grad-cost: linear-gradient(135deg, oklch(0.85 0.15 200), oklch(0.75 0.20 280));

  /* Glow / aura */
  --glow-active: 0 0 30px oklch(0.65 0.18 220 / 0.25);
  --glow-warning: 0 0 30px oklch(0.70 0.20 60 / 0.25);
  --glow-success: 0 0 30px oklch(0.70 0.18 145 / 0.30);
  --glow-error: 0 0 30px oklch(0.62 0.22 25 / 0.30);

  /* Gamification */
  --xp-bar-fill: linear-gradient(90deg, oklch(0.75 0.18 145), oklch(0.85 0.20 100));
  --level-badge: linear-gradient(135deg, oklch(0.75 0.18 60), oklch(0.65 0.22 25));
  --streak-flame: linear-gradient(180deg, oklch(0.80 0.22 30), oklch(0.70 0.25 15));

  /* Typography weights pod cinematic */
  --font-display: "Space Grotesk", system-ui, sans-serif;
}

/* Reduced motion fallbacks — ambient animations off */
@media (prefers-reduced-motion: reduce) {
  :root[data-theme="broadcast"] {
    --glow-active: none;
    --glow-warning: none;
    --glow-success: none;
    --glow-error: none;
  }
}
```

- [ ] **Step 2: Zaimportuj tokens w global CSS**

W `ui/src/index.css` na **końcu pliku** dodaj:
```css
@import "./broadcast/tokens.css";
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @paperclipai/ui build
```
Expected: build kończy się sukcesem (czyste skompilowane CSS, brak warnings o nieznanym tokenie).

- [ ] **Step 4: Commit**

```bash
git add ui/src/broadcast/tokens.css ui/src/index.css
git commit -m "feat(broadcast): add tokens.css with cinematic palette + glows + gamification"
```

---

## Task 3: Hook useBroadcastTheme z feature flagiem

**Files:**
- Create: `ui/src/broadcast/hooks/useBroadcastTheme.ts`
- Create: `ui/src/broadcast/hooks/useBroadcastTheme.test.ts`
- Modify: `ui/src/App.tsx` (lub `main.tsx` — sprawdź gdzie żyje root; preferuj App.tsx, bo to root komponent React)

- [ ] **Step 1: Napisz failing test**

Plik `ui/src/broadcast/hooks/useBroadcastTheme.test.ts`:
```ts
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

describe("useBroadcastTheme", () => {
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

  it("does not apply broadcast theme when neither flag is set", () => {
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("applies broadcast theme when ?broadcast=1 is in URL", () => {
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("applies broadcast theme when localStorage.paperclip_broadcast is '1'", () => {
    localStorage.setItem("paperclip_broadcast", "1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("broadcast");
  });

  it("persists flag from URL to localStorage", () => {
    window.history.replaceState({}, "", "/?broadcast=1");
    const root = createRoot(container);
    act(() => { root.render(<Probe />); });
    expect(localStorage.getItem("paperclip_broadcast")).toBe("1");
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @paperclipai/ui test:run -- useBroadcastTheme
```
Expected: 4 testy FAIL (`Cannot find module`).

- [ ] **Step 3: Implementacja**

Plik `ui/src/broadcast/hooks/useBroadcastTheme.ts`:
```ts
import { useEffect } from "react";

const STORAGE_KEY = "paperclip_broadcast";
const URL_PARAM = "broadcast";

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) === "1") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function persistFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) === "1") {
    window.localStorage.setItem(STORAGE_KEY, "1");
  }
}

export function useBroadcastTheme(): void {
  useEffect(() => {
    persistFromUrl();
    if (readEnabled()) {
      document.documentElement.setAttribute("data-theme", "broadcast");
    }
  }, []);
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @paperclipai/ui test:run -- useBroadcastTheme
```
Expected: 4/4 PASS.

- [ ] **Step 5: Wpięcie w App.tsx**

W `ui/src/App.tsx` (otwórz, zorientuj się gdzie jest root App component) dodaj jako pierwszy hook w komponencie:
```tsx
import { useBroadcastTheme } from "@/broadcast/hooks/useBroadcastTheme";
// ...
useBroadcastTheme();
```

- [ ] **Step 6: Manual smoke**

```bash
pnpm dev
```
Otwórz `http://localhost:3100?broadcast=1` → sprawdź w DevTools że `<html data-theme="broadcast">`. Odśwież bez query → flaga persystuje (z localStorage). Wyczyść localStorage + reload bez query → atrybut zniknął.

- [ ] **Step 7: Commit**

```bash
git add ui/src/broadcast/hooks/ ui/src/App.tsx
git commit -m "feat(broadcast): add useBroadcastTheme hook with URL+localStorage flag"
```

---

## Task 4: GlowFrame component

`GlowFrame` opakowuje children w div z box-shadow w jednym z czterech stanów (active/idle/warning/success/error). Podstawowy primitive używany przez resztę komponentów.

**Files:**
- Create: `ui/src/broadcast/components/GlowFrame.tsx`
- Create: `ui/src/broadcast/components/GlowFrame.test.tsx`
- Modify: `ui/src/broadcast/components/index.ts`

- [ ] **Step 1: Napisz failing test**

Plik `ui/src/broadcast/components/GlowFrame.test.tsx`:
```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GlowFrame } from "./GlowFrame";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("GlowFrame", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("renders children", () => {
    const root = createRoot(container);
    act(() => { root.render(<GlowFrame state="active"><span>kids</span></GlowFrame>); });
    expect(container.textContent).toBe("kids");
  });

  it("applies state-specific class for 'active'", () => {
    const root = createRoot(container);
    act(() => { root.render(<GlowFrame state="active">x</GlowFrame>); });
    const frame = container.querySelector("[data-glow-state='active']");
    expect(frame).not.toBeNull();
  });

  it("renders without crashing for each state", () => {
    const states = ["active", "idle", "warning", "success", "error"] as const;
    for (const s of states) {
      const root = createRoot(container);
      act(() => { root.render(<GlowFrame state={s}>x</GlowFrame>); });
      expect(container.querySelector(`[data-glow-state='${s}']`)).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
pnpm --filter @paperclipai/ui test:run -- GlowFrame
```
Expected: FAIL — `Cannot find module './GlowFrame'`.

- [ ] **Step 3: Implementacja**

Plik `ui/src/broadcast/components/GlowFrame.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glowFrame = cva(
  "rounded-lg border transition-shadow",
  {
    variants: {
      state: {
        active: "border-primary/40 shadow-[var(--glow-active)]",
        idle: "border-border shadow-none",
        warning: "border-amber-500/40 shadow-[var(--glow-warning)]",
        success: "border-green-500/40 shadow-[var(--glow-success)]",
        error: "border-red-500/40 shadow-[var(--glow-error)]",
      },
    },
    defaultVariants: { state: "idle" },
  },
);

export interface GlowFrameProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glowFrame> {
  state: NonNullable<VariantProps<typeof glowFrame>["state"]>;
}

export function GlowFrame({ state, className, children, ...rest }: GlowFrameProps) {
  return (
    <div data-glow-state={state} className={cn(glowFrame({ state }), className)} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Eksport w barrel**

W `ui/src/broadcast/components/index.ts`:
```ts
export { GlowFrame, type GlowFrameProps } from "./GlowFrame";
```

- [ ] **Step 5: Run test, verify pass**

```bash
pnpm --filter @paperclipai/ui test:run -- GlowFrame
```
Expected: 3/3 PASS.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add ui/src/broadcast/components/GlowFrame.tsx ui/src/broadcast/components/GlowFrame.test.tsx ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add GlowFrame component with 5 state variants"
```

---

## Task 5: LiveDot component

Pulsujący dot + opcjonalny tekst, dla "● live", "● idle" itp.

**Files:**
- Create: `ui/src/broadcast/components/LiveDot.tsx`
- Create: `ui/src/broadcast/components/LiveDot.test.tsx`
- Modify: `ui/src/broadcast/components/index.ts`

- [ ] **Step 1: Napisz failing test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveDot } from "./LiveDot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LiveDot", () => {
  let container: HTMLDivElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it("renders text label", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="active" label="live" />); });
    expect(container.textContent).toContain("live");
  });

  it("applies pulse animation when pulse=true and status=active", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="active" pulse label="live" />); });
    const dot = container.querySelector("[data-live-dot]");
    expect(dot?.className).toContain("animate-pulse");
  });

  it("does not pulse when status=idle even if pulse=true", () => {
    const root = createRoot(container);
    act(() => { root.render(<LiveDot status="idle" pulse label="idle" />); });
    const dot = container.querySelector("[data-live-dot]");
    expect(dot?.className).not.toContain("animate-pulse");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
pnpm --filter @paperclipai/ui test:run -- LiveDot
```

- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export type LiveDotStatus = "active" | "idle" | "warning" | "success" | "error";

const dotColor: Record<LiveDotStatus, string> = {
  active: "bg-cyan-400",
  idle: "bg-neutral-500",
  warning: "bg-amber-400",
  success: "bg-green-400",
  error: "bg-red-400",
};

const textColor: Record<LiveDotStatus, string> = {
  active: "text-cyan-400",
  idle: "text-neutral-500",
  warning: "text-amber-400",
  success: "text-green-400",
  error: "text-red-400",
};

export interface LiveDotProps {
  status: LiveDotStatus;
  label?: string;
  pulse?: boolean;
  className?: string;
}

export function LiveDot({ status, label, pulse, className }: LiveDotProps) {
  const active = status === "active";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", textColor[status], className)}>
      <span
        data-live-dot
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          dotColor[status],
          pulse && active && "animate-pulse",
        )}
      />
      {label && <span>{label}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Eksport w barrel**

```ts
export { LiveDot, type LiveDotProps, type LiveDotStatus } from "./LiveDot";
```

- [ ] **Step 5: Run test PASS + typecheck**

```bash
pnpm --filter @paperclipai/ui test:run -- LiveDot
pnpm --filter @paperclipai/ui typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/broadcast/components/LiveDot.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add LiveDot component with pulse animation"
```

---

## Task 6: LevelBadge component

Złoto-czerwony badge w gradiencie z numerem levelu.

**Files:**
- Create: `ui/src/broadcast/components/LevelBadge.tsx`
- Create: `ui/src/broadcast/components/LevelBadge.test.tsx`
- Modify: `ui/src/broadcast/components/index.ts`

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LevelBadge } from "./LevelBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("LevelBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders level number with 'LVL' prefix", () => {
    const root = createRoot(c);
    act(() => { root.render(<LevelBadge level={7} />); });
    expect(c.textContent).toBe("LVL 7");
  });

  it("supports size variants", () => {
    const root = createRoot(c);
    act(() => { root.render(<LevelBadge level={3} size="xs" />); });
    const el = c.querySelector("[data-level-badge]");
    expect(el?.className).toMatch(/text-\[9px\]|text-xs/);
  });
});
```

- [ ] **Step 2: FAIL run**

```bash
pnpm --filter @paperclipai/ui test:run -- LevelBadge
```

- [ ] **Step 3: Implementacja**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const levelBadge = cva(
  "inline-flex items-center justify-center rounded font-extrabold tracking-tight uppercase text-white",
  {
    variants: {
      size: {
        xs: "px-1 py-px text-[9px]",
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface LevelBadgeProps extends VariantProps<typeof levelBadge> {
  level: number;
  className?: string;
}

export function LevelBadge({ level, size, className }: LevelBadgeProps) {
  return (
    <span
      data-level-badge
      className={cn(levelBadge({ size }), className)}
      style={{ background: "var(--level-badge)" }}
    >
      LVL {level}
    </span>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { LevelBadge, type LevelBadgeProps } from "./LevelBadge";
```
```bash
pnpm --filter @paperclipai/ui test:run -- LevelBadge
pnpm --filter @paperclipai/ui typecheck
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/LevelBadge.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add LevelBadge with size variants"
```

---

## Task 7: StreakBadge component

Płomień + liczba dni. Pokazuje serię ciągłej aktywności agenta.

**Files:** analogicznie do LevelBadge — Streakbadge.tsx + test + index.ts update.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StreakBadge } from "./StreakBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("StreakBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 'streak Xd' with day count", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={12} />); });
    expect(c.textContent).toContain("12d");
  });

  it("does not render fire icon when days < 1", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={0} />); });
    expect(c.querySelector("[data-streak-flame]")).toBeNull();
  });

  it("renders fire icon when days >= 1", () => {
    const root = createRoot(c);
    act(() => { root.render(<StreakBadge days={3} />); });
    expect(c.querySelector("[data-streak-flame]")).not.toBeNull();
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreakBadgeProps {
  days: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizes = {
  xs: { container: "text-[9px] px-1 py-px", icon: 8 },
  sm: { container: "text-[10px] px-1.5 py-0.5", icon: 10 },
  md: { container: "text-xs px-2 py-1", icon: 12 },
};

export function StreakBadge({ days, size = "sm", className }: StreakBadgeProps) {
  const s = sizes[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-bold uppercase tracking-tight",
        s.container,
        className,
      )}
      style={{
        background: "var(--streak-flame)",
        color: "white",
      }}
    >
      {days >= 1 && <Flame data-streak-flame size={s.icon} />}
      streak {days}d
    </span>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { StreakBadge, type StreakBadgeProps } from "./StreakBadge";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/StreakBadge.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add StreakBadge with flame icon"
```

---

## Task 8: XPBar component

Pasek postępu XP w gradiencie, opcjonalny label "X / Y XP".

**Files:** XPBar.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { XPBar } from "./XPBar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("XPBar", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("computes width percentage", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={40} target={100} />); });
    const fill = c.querySelector<HTMLDivElement>("[data-xp-fill]");
    expect(fill?.style.width).toBe("40%");
  });

  it("caps at 100%", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={250} target={100} />); });
    const fill = c.querySelector<HTMLDivElement>("[data-xp-fill]");
    expect(fill?.style.width).toBe("100%");
  });

  it("renders label when provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<XPBar current={40} target={100} label="40 / 100 XP" />); });
    expect(c.textContent).toContain("40 / 100 XP");
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export interface XPBarProps {
  current: number;
  target: number;
  label?: string;
  className?: string;
}

export function XPBar({ current, target, label, className }: XPBarProps) {
  const pct = Math.max(0, Math.min(100, target > 0 ? (current / target) * 100 : 0));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-xp-fill
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "var(--xp-bar-fill)",
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { XPBar, type XPBarProps } from "./XPBar";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/XPBar.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add XPBar progress component"
```

---

## Task 9: EqualizerIndicator component

4 pionowe paski animowane (audio equalizer style) gdy `active=true`. Symbol "agent myśli".

**Files:** EqualizerIndicator.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EqualizerIndicator } from "./EqualizerIndicator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("EqualizerIndicator", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 4 bars", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active />); });
    expect(c.querySelectorAll("[data-eq-bar]").length).toBe(4);
  });

  it("bars are static when active=false", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active={false} />); });
    const bar = c.querySelector<HTMLDivElement>("[data-eq-bar]");
    expect(bar?.style.animation).toBe("");
  });

  it("bars animate when active=true", () => {
    const root = createRoot(c);
    act(() => { root.render(<EqualizerIndicator active />); });
    const bar = c.querySelector<HTMLDivElement>("[data-eq-bar]");
    expect(bar?.style.animation).not.toBe("");
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export interface EqualizerIndicatorProps {
  active: boolean;
  intensity?: "low" | "med" | "high";
  className?: string;
}

const bars = [
  { height: 6, delay: 0 },
  { height: 12, delay: 0.2 },
  { height: 8, delay: 0.4 },
  { height: 10, delay: 0.6 },
];

const intensityDuration: Record<NonNullable<EqualizerIndicatorProps["intensity"]>, number> = {
  low: 1.4,
  med: 1.0,
  high: 0.7,
};

export function EqualizerIndicator({ active, intensity = "med", className }: EqualizerIndicatorProps) {
  const dur = intensityDuration[intensity];
  return (
    <div className={cn("inline-flex items-end gap-0.5", className)} aria-hidden="true">
      <style>{`
        @keyframes broadcast-eq-wave { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); } }
        @media (prefers-reduced-motion: reduce) {
          [data-eq-bar] { animation: none !important; transform: none !important; }
        }
      `}</style>
      {bars.map((b, i) => (
        <span
          key={i}
          data-eq-bar
          className="w-[3px] rounded-sm bg-cyan-400"
          style={{
            height: `${b.height}px`,
            animation: active
              ? `broadcast-eq-wave ${dur}s ease-in-out infinite ${b.delay}s`
              : undefined,
            opacity: active ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { EqualizerIndicator, type EqualizerIndicatorProps } from "./EqualizerIndicator";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/EqualizerIndicator.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add EqualizerIndicator audio-style bars"
```

---

## Task 10: CostTicker component

Animowana liczba kosztu w gradient text, opcjonalna cap, formatowanie waluty.

**Files:** CostTicker.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CostTicker } from "./CostTicker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("CostTicker", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders formatted value in USD", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={0.41} currency="USD" />); });
    expect(c.textContent).toContain("$0.41");
  });

  it("renders formatted value in PLN", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={12.5} currency="PLN" />); });
    expect(c.textContent).toMatch(/12[,.]50\s?z[łl]/i);
  });

  it("renders cap line when cap provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<CostTicker value={0.41} cap={5} currency="USD" />); });
    expect(c.textContent).toContain("/ $5.00 cap");
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export type CostCurrency = "USD" | "PLN" | "EUR";

const localeFor: Record<CostCurrency, string> = {
  USD: "en-US",
  PLN: "pl-PL",
  EUR: "de-DE",
};

function format(value: number, currency: CostCurrency): string {
  return new Intl.NumberFormat(localeFor[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface CostTickerProps {
  value: number;
  cap?: number;
  currency: CostCurrency;
  className?: string;
}

export function CostTicker({ value, cap, currency, className }: CostTickerProps) {
  return (
    <div className={cn("text-right", className)}>
      <div
        className="text-base font-extrabold leading-none"
        style={{
          background: "var(--grad-cost)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {format(value, currency)}
      </div>
      {cap !== undefined && (
        <div className="text-[9px] text-muted-foreground">
          / {format(cap, currency)} cap
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { CostTicker, type CostTickerProps, type CostCurrency } from "./CostTicker";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/CostTicker.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add CostTicker with multi-currency formatting"
```

---

## Task 11: PlatformBadge component

Tag platformy reklamowej (Meta/Google) w brand colors.

**Files:** PlatformBadge.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlatformBadge } from "./PlatformBadge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("PlatformBadge", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders 'META' for meta platform", () => {
    const root = createRoot(c);
    act(() => { root.render(<PlatformBadge platform="meta" />); });
    expect(c.textContent).toBe("META");
  });

  it("renders 'GOOGLE' for google platform", () => {
    const root = createRoot(c);
    act(() => { root.render(<PlatformBadge platform="google" />); });
    expect(c.textContent).toBe("GOOGLE");
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export type AdPlatform = "meta" | "google";

const palette: Record<AdPlatform, { bg: string; fg: string; label: string }> = {
  meta: { bg: "bg-[#1877f2]", fg: "text-white", label: "META" },
  google: { bg: "bg-[#4285f4]", fg: "text-white", label: "GOOGLE" },
};

export interface PlatformBadgeProps {
  platform: AdPlatform;
  className?: string;
}

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const p = palette[platform];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-tight",
        p.bg,
        p.fg,
        className,
      )}
    >
      {p.label}
    </span>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { PlatformBadge, type PlatformBadgeProps, type AdPlatform } from "./PlatformBadge";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/PlatformBadge.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add PlatformBadge (Meta/Google) brand tags"
```

---

## Task 12: ThoughtStream component

Terminal-styled konsola z myślami agenta. Bez logiki streamingu na razie — przyjmuje propsami listę linii.

**Files:** ThoughtStream.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThoughtStream, type ThoughtLine } from "./ThoughtStream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const lines: ThoughtLine[] = [
  { kind: "tool", text: "tool: meta_ads.create_campaign", ts: "0.1s" },
  { kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" },
];

describe("ThoughtStream", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders each line", () => {
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={lines} />); });
    expect(c.textContent).toContain("meta_ads.create_campaign");
    expect(c.textContent).toContain("Audiencja wędkarze");
  });

  it("renders blinking cursor when active=true", () => {
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={lines} active />); });
    expect(c.querySelector("[data-thought-cursor]")).not.toBeNull();
  });

  it("respects maxLines prop", () => {
    const many: ThoughtLine[] = Array.from({ length: 10 }, (_, i) => ({ kind: "thought" as const, text: `L${i}`, ts: `${i}s` }));
    const root = createRoot(c);
    act(() => { root.render(<ThoughtStream lines={many} maxLines={3} />); });
    expect(c.querySelectorAll("[data-thought-line]").length).toBe(3);
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export type ThoughtKind = "thought" | "tool" | "result";

export interface ThoughtLine {
  kind: ThoughtKind;
  text: string;
  ts?: string;
}

export interface ThoughtStreamProps {
  lines: ThoughtLine[];
  active?: boolean;
  maxLines?: number;
  className?: string;
}

const kindColor: Record<ThoughtKind, string> = {
  thought: "text-foreground",
  tool: "text-muted-foreground",
  result: "text-green-400",
};

const kindPrefix: Record<ThoughtKind, string> = {
  thought: "",
  tool: "▸ ",
  result: "✓ ",
};

export function ThoughtStream({ lines, active, maxLines = 6, className }: ThoughtStreamProps) {
  const visible = lines.slice(-maxLines);
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background/60 p-2 font-mono text-[10px] leading-relaxed",
        className,
      )}
    >
      <style>{`
        @keyframes broadcast-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          [data-thought-cursor] { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
      {visible.map((l, i) => (
        <div key={i} data-thought-line className={cn("truncate", kindColor[l.kind])}>
          {l.ts && <span className="text-muted-foreground/60">[{l.ts}] </span>}
          {kindPrefix[l.kind]}
          {l.text}
        </div>
      ))}
      {active && (
        <span
          data-thought-cursor
          className="inline-block h-3 w-1.5 bg-cyan-400 align-middle"
          style={{ animation: "broadcast-blink 1s steps(2) infinite" }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { ThoughtStream, type ThoughtStreamProps, type ThoughtLine, type ThoughtKind } from "./ThoughtStream";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/ThoughtStream.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add ThoughtStream terminal-style line viewer"
```

---

## Task 13: MissionCard component

"Misja" — gamifikowana karta dużego zadania z progressem i opcjonalnym XP reward.

**Files:** MissionCard.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MissionCard } from "./MissionCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("MissionCard", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders title and progress", () => {
    const root = createRoot(c);
    act(() => { root.render(<MissionCard title="Kampania wiosenna" progress={0.6} />); });
    expect(c.textContent).toContain("Kampania wiosenna");
    expect(c.querySelector("[data-mission-progress]")).not.toBeNull();
  });

  it("renders reward when provided", () => {
    const root = createRoot(c);
    act(() => { root.render(<MissionCard title="X" progress={0} reward="+50 XP" />); });
    expect(c.textContent).toContain("+50 XP");
  });

  it("renders subtasks count when tasks provided", () => {
    const root = createRoot(c);
    act(() => {
      root.render(<MissionCard title="X" progress={0.5} tasks={{ done: 2, total: 4 }} />);
    });
    expect(c.textContent).toMatch(/2\s*\/\s*4/);
  });
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";

export interface MissionCardProps {
  title: string;
  progress: number; // 0..1
  tasks?: { done: number; total: number };
  reward?: string;
  className?: string;
  onClick?: () => void;
}

export function MissionCard({ title, progress, tasks, reward, className, onClick }: MissionCardProps) {
  const pct = Math.max(0, Math.min(100, progress * 100));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {reward && (
          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
            {reward}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          data-mission-progress
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {tasks && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {tasks.done} / {tasks.total} tasks
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Eksport + test PASS + typecheck**

```ts
export { MissionCard, type MissionCardProps } from "./MissionCard";
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/broadcast/components/MissionCard.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add MissionCard with progress + optional reward"
```

---

## Task 14: AgentBroadcastCard component (najbardziej złożony)

Karta agenta w 3 wariantach (`compact`, `full`, `hero`). Łączy GlowFrame + LiveDot + LevelBadge + StreakBadge + EqualizerIndicator + CostTicker + ThoughtStream + PlatformBadge.

**Files:** AgentBroadcastCard.tsx + test + index.ts.

- [ ] **Step 1: Test**

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentBroadcastCard, type AgentBroadcastCardProps } from "./AgentBroadcastCard";
import type { ThoughtLine } from "./ThoughtStream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const baseProps: AgentBroadcastCardProps = {
  agent: { id: "a1", name: "Marketing AI", initials: "M", color: "var(--grad-agent)" },
  status: "active",
  currentTask: "Kampania wiosenna 2026",
  currentTool: "meta_ads.create_campaign",
  cost: { value: 0.41, cap: 5, currency: "USD" },
  level: 7,
  streakDays: 12,
  thoughts: [{ kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" }] as ThoughtLine[],
  tags: [{ kind: "platform", platform: "meta" }, { kind: "text", text: "PROPOSAL", tone: "warning" }],
  variant: "full",
};

describe("AgentBroadcastCard", () => {
  let c: HTMLDivElement;
  beforeEach(() => { c = document.createElement("div"); document.body.appendChild(c); });
  afterEach(() => { c.remove(); });

  it("renders agent name and initials", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("Marketing AI");
  });

  it("renders cost ticker", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("$0.41");
  });

  it("renders level and streak badges when in 'full' variant", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("LVL 7");
    expect(c.textContent).toContain("12d");
  });

  it("renders thought stream when thoughts non-empty", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("Audiencja wędkarze");
  });

  it("renders PlatformBadge from tags", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} />); });
    expect(c.textContent).toContain("META");
  });

  it("does not render thought stream in 'compact' variant", () => {
    const root = createRoot(c);
    act(() => { root.render(<AgentBroadcastCard {...baseProps} variant="compact" />); });
    expect(c.textContent).not.toContain("Audiencja wędkarze");
  });
});
```

- [ ] **Step 2: FAIL**

```bash
pnpm --filter @paperclipai/ui test:run -- AgentBroadcastCard
```

- [ ] **Step 3: Implementacja**

```tsx
import { cn } from "@/lib/utils";
import { GlowFrame } from "./GlowFrame";
import { LiveDot, type LiveDotStatus } from "./LiveDot";
import { LevelBadge } from "./LevelBadge";
import { StreakBadge } from "./StreakBadge";
import { EqualizerIndicator } from "./EqualizerIndicator";
import { CostTicker, type CostCurrency } from "./CostTicker";
import { ThoughtStream, type ThoughtLine } from "./ThoughtStream";
import { PlatformBadge, type AdPlatform } from "./PlatformBadge";

export type AgentBroadcastVariant = "compact" | "full" | "hero";

type Tag =
  | { kind: "platform"; platform: AdPlatform }
  | { kind: "text"; text: string; tone?: "neutral" | "warning" | "success" | "error" };

export interface AgentBroadcastCardProps {
  agent: { id: string; name: string; initials: string; color: string };
  status: LiveDotStatus;
  currentTask: string;
  currentTool?: string;
  cost: { value: number; cap?: number; currency: CostCurrency };
  level?: number;
  streakDays?: number;
  thoughts?: ThoughtLine[];
  tags?: Tag[];
  variant?: AgentBroadcastVariant;
  className?: string;
  onClick?: () => void;
}

const toneClass: Record<NonNullable<Extract<Tag, { kind: "text" }>["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/20 text-amber-400",
  success: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

export function AgentBroadcastCard({
  agent,
  status,
  currentTask,
  currentTool,
  cost,
  level,
  streakDays,
  thoughts,
  tags,
  variant = "full",
  className,
  onClick,
}: AgentBroadcastCardProps) {
  const showHeroDecor = variant === "hero";
  const showThoughts = (variant === "full" || variant === "hero") && thoughts && thoughts.length > 0;
  const showLevel = (variant === "full" || variant === "hero") && level !== undefined;
  const showStreak = (variant === "full" || variant === "hero") && streakDays !== undefined && streakDays > 0;
  const isActive = status === "active";

  const inner = (
    <div className={cn("flex flex-col gap-2 p-3", showHeroDecor && "p-4 gap-3")}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex items-center justify-center rounded-full font-bold text-white",
            showHeroDecor ? "h-12 w-12 text-lg" : "h-9 w-9 text-sm",
          )}
          style={{ background: agent.color }}
        >
          {agent.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("font-semibold truncate", showHeroDecor ? "text-base" : "text-xs")}>
              {agent.name}
            </span>
            {showLevel && <LevelBadge level={level!} size="xs" />}
          </div>
          <div className="flex items-center gap-2">
            <LiveDot status={status} label={status} pulse />
            {showStreak && <StreakBadge days={streakDays!} size="xs" />}
          </div>
        </div>
        <CostTicker value={cost.value} cap={cost.cap} currency={cost.currency} />
      </div>

      <div className={cn("font-medium", showHeroDecor ? "text-sm" : "text-xs")}>{currentTask}</div>

      {showThoughts && (
        <ThoughtStream
          lines={thoughts!}
          active={isActive}
          maxLines={showHeroDecor ? 12 : 4}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {currentTool && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {currentTool}
          </span>
        )}
        {tags?.map((t, i) =>
          t.kind === "platform" ? (
            <PlatformBadge key={i} platform={t.platform} />
          ) : (
            <span
              key={i}
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight",
                toneClass[t.tone ?? "neutral"],
              )}
            >
              {t.text}
            </span>
          ),
        )}
        <div className="ml-auto">
          <EqualizerIndicator active={isActive} />
        </div>
      </div>
    </div>
  );

  return (
    <GlowFrame
      state={status === "active" ? "active" : status === "error" ? "error" : "idle"}
      className={cn(
        "bg-card cursor-pointer transition-transform",
        onClick && "hover:scale-[1.01]",
        className,
      )}
      onClick={onClick}
    >
      {inner}
    </GlowFrame>
  );
}
```

- [ ] **Step 4: Eksport w barrel**

```ts
export { AgentBroadcastCard, type AgentBroadcastCardProps, type AgentBroadcastVariant } from "./AgentBroadcastCard";
```

- [ ] **Step 5: Run test PASS + typecheck**

```bash
pnpm --filter @paperclipai/ui test:run -- AgentBroadcastCard
pnpm --filter @paperclipai/ui typecheck
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/broadcast/components/AgentBroadcastCard.* ui/src/broadcast/components/index.ts
git commit -m "feat(broadcast): add AgentBroadcastCard composite (compact/full/hero variants)"
```

---

## Task 15: Sekcja "Broadcast" w /design-guide

Pokazuje wszystkie 11 cinematic komponentów na żywo. Po Tasku 14 wszystkie komponenty są gotowe — to spinający task wizualny.

**Files:**
- Modify: `ui/src/pages/DesignGuide.tsx` (dodaj 1 nową `<Section title="Broadcast">` ze wszystkimi komponentami)

- [ ] **Step 1: Otwórz DesignGuide.tsx i znajdź wzorzec Section / SubSection**

Sprawdź jak są strukturowane istniejące sekcje — chcemy zachować konwencję wizualną.

- [ ] **Step 2: Dodaj sekcję na końcu komponentu**

```tsx
import {
  GlowFrame,
  LiveDot,
  LevelBadge,
  StreakBadge,
  XPBar,
  EqualizerIndicator,
  CostTicker,
  PlatformBadge,
  ThoughtStream,
  MissionCard,
  AgentBroadcastCard,
} from "@/broadcast";
```

Wewnątrz return:
```tsx
<Section title="Broadcast (cinematic theme)">
  <SubSection title="GlowFrame — 5 stanów">
    <div className="grid grid-cols-5 gap-3">
      {(["active","idle","warning","success","error"] as const).map(s => (
        <GlowFrame key={s} state={s} className="p-3">
          <div className="text-xs">{s}</div>
        </GlowFrame>
      ))}
    </div>
  </SubSection>
  <SubSection title="LiveDot">
    <div className="flex gap-4">
      <LiveDot status="active" label="working" pulse />
      <LiveDot status="idle" label="idle" />
      <LiveDot status="warning" label="rate limited" />
      <LiveDot status="success" label="done" />
      <LiveDot status="error" label="failed" />
    </div>
  </SubSection>
  <SubSection title="LevelBadge / StreakBadge">
    <div className="flex items-center gap-2">
      <LevelBadge level={1} size="xs" />
      <LevelBadge level={7} size="sm" />
      <LevelBadge level={42} size="md" />
      <StreakBadge days={3} size="xs" />
      <StreakBadge days={12} size="sm" />
      <StreakBadge days={99} size="md" />
    </div>
  </SubSection>
  <SubSection title="XPBar">
    <div className="space-y-2 max-w-sm">
      <XPBar current={20} target={100} label="20 / 100 XP" />
      <XPBar current={75} target={100} label="75 / 100 XP" />
      <XPBar current={120} target={100} label="overflow capped" />
    </div>
  </SubSection>
  <SubSection title="EqualizerIndicator">
    <div className="flex items-center gap-4">
      <EqualizerIndicator active />
      <EqualizerIndicator active intensity="high" />
      <EqualizerIndicator active={false} />
    </div>
  </SubSection>
  <SubSection title="CostTicker">
    <div className="flex items-center gap-6">
      <CostTicker value={0.41} cap={5} currency="USD" />
      <CostTicker value={42.5} cap={500} currency="PLN" />
      <CostTicker value={2.99} currency="EUR" />
    </div>
  </SubSection>
  <SubSection title="PlatformBadge">
    <div className="flex gap-2">
      <PlatformBadge platform="meta" />
      <PlatformBadge platform="google" />
    </div>
  </SubSection>
  <SubSection title="ThoughtStream">
    <div className="max-w-md">
      <ThoughtStream
        active
        lines={[
          { kind: "tool", text: "tool: meta_ads.create_campaign", ts: "0.1s" },
          { kind: "thought", text: "Audiencja wędkarze 25-50, geo PL, interest fishing+spinning...", ts: "2.3s" },
          { kind: "result", text: "Proposal saved", ts: "3.8s" },
        ]}
      />
    </div>
  </SubSection>
  <SubSection title="MissionCard">
    <div className="grid grid-cols-2 gap-3 max-w-2xl">
      <MissionCard title="Kampania wiosenna 2026" progress={0.6} tasks={{ done: 3, total: 5 }} reward="+50 XP" />
      <MissionCard title="Audyt SEO" progress={0.2} tasks={{ done: 1, total: 5 }} />
    </div>
  </SubSection>
  <SubSection title="AgentBroadcastCard — variants">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <AgentBroadcastCard
        agent={{ id: "1", name: "Marketing AI", initials: "M", color: "var(--grad-marketing)" }}
        status="active"
        currentTask="Kampania wiosenna 2026"
        currentTool="meta_ads.create_campaign"
        cost={{ value: 0.41, cap: 5, currency: "USD" }}
        level={7}
        streakDays={12}
        thoughts={[{ kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" }]}
        tags={[{ kind: "platform", platform: "meta" }, { kind: "text", text: "PROPOSAL", tone: "warning" }]}
        variant="compact"
      />
      <AgentBroadcastCard
        agent={{ id: "1", name: "Marketing AI", initials: "M", color: "var(--grad-marketing)" }}
        status="active"
        currentTask="Kampania wiosenna 2026"
        currentTool="meta_ads.create_campaign"
        cost={{ value: 0.41, cap: 5, currency: "USD" }}
        level={7}
        streakDays={12}
        thoughts={[
          { kind: "tool", text: "tool: meta_ads.create_campaign", ts: "0.1s" },
          { kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" },
        ]}
        tags={[{ kind: "platform", platform: "meta" }, { kind: "text", text: "PROPOSAL", tone: "warning" }]}
        variant="full"
      />
      <AgentBroadcastCard
        agent={{ id: "1", name: "Marketing AI", initials: "M", color: "var(--grad-marketing)" }}
        status="active"
        currentTask="Kampania wiosenna 2026"
        currentTool="meta_ads.create_campaign"
        cost={{ value: 0.41, cap: 5, currency: "USD" }}
        level={7}
        streakDays={12}
        thoughts={[
          { kind: "tool", text: "tool: meta_ads.create_campaign", ts: "0.1s" },
          { kind: "thought", text: "Audiencja wędkarze 25-50, geo PL...", ts: "2.3s" },
          { kind: "result", text: "Brief saved", ts: "4.1s" },
        ]}
        tags={[{ kind: "platform", platform: "meta" }, { kind: "text", text: "PROPOSAL", tone: "warning" }]}
        variant="hero"
      />
    </div>
  </SubSection>
</Section>
```

- [ ] **Step 3: Manual smoke**

```bash
pnpm dev
```
Otwórz `http://localhost:3100/design-guide?broadcast=1` → przewiń do dolnej sekcji "Broadcast". Wszystkie 11 komponentów się renderują, animacje działają.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/DesignGuide.tsx
git commit -m "feat(broadcast): showcase cinematic components on /design-guide"
```

---

## Task 16: Reskin Sidebar

Sidebar dostaje broadcast vibe: ciemniejsze tło, gradientowy logo, hover states z glow.

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Otwórz Sidebar.tsx i zrób snapshot kontekstu**

Sprawdź jakie klasy Tailwind są używane teraz; lista TODO-rzeczy do podmienienia:
- bazowe `bg-*` na `bg-card` lub `bg-background`
- borders na `border-border`
- hover na `hover:bg-accent/40`
- aktywne item: dodać `shadow-[var(--glow-active)]` przy `data-active`

- [ ] **Step 2: Zaktualizuj klasy**

Bez zmiany struktury JSX, tylko classNames. Przykład wzorca dla nav item:
```tsx
<Link
  to={...}
  className={cn(
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
    "hover:bg-accent/40",
    active && "bg-accent text-accent-foreground shadow-[var(--glow-active)]",
  )}
>
```

- [ ] **Step 3: Manual smoke**

`pnpm dev` → `http://localhost:3100?broadcast=1` → sidebar wygląda nowo.

- [ ] **Step 4: Typecheck + jakikolwiek istniejący test sidebar**

```bash
pnpm --filter @paperclipai/ui typecheck
pnpm --filter @paperclipai/ui test:run -- Sidebar
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/Sidebar.tsx
git commit -m "style(broadcast): reskin Sidebar with broadcast tokens"
```

---

## Task 17: Reskin Layout

Top-level layout — zaktualizować klasy tła, separatorów. Sprawdzić że `<html data-theme="broadcast">` jest brane pod uwagę.

**Files:**
- Modify: `ui/src/components/Layout.tsx`

- [ ] **Step 1: Klasy tła / separatorów**

Zmiany podobne jak w Tasku 16:
- main `bg-background`
- separatory `border-border`

- [ ] **Step 2: Manual smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/Layout.tsx
git commit -m "style(broadcast): reskin Layout container"
```

---

## Task 18: Reskin BreadcrumbBar

**Files:**
- Modify: `ui/src/components/BreadcrumbBar.tsx`

- [ ] **Step 1: Updated classes**

- separator `text-muted-foreground/40`
- last crumb `text-foreground font-medium`
- non-last crumb `text-muted-foreground hover:text-foreground transition-colors`

- [ ] **Step 2: Manual smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/BreadcrumbBar.tsx
git commit -m "style(broadcast): reskin BreadcrumbBar"
```

---

## Task 19: Reskin CompanySwitcher

**Files:**
- Modify: `ui/src/components/CompanySwitcher.tsx`

- [ ] **Step 1: Zaktualizuj wygląd**

- Trigger dostaje `GlowFrame` wokół (state="idle" lub "active" jeśli rozwinięty)
- W rozwinięciu items: hover `bg-accent/40`
- Avatar firmy: gradient z `var(--grad-agent)` jako fallback

- [ ] **Step 2: Smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/CompanySwitcher.tsx
git commit -m "style(broadcast): reskin CompanySwitcher with GlowFrame"
```

---

## Task 20: Reskin MetricCard

**Files:**
- Modify: `ui/src/components/MetricCard.tsx`

- [ ] **Step 1: Karty metryk**

- Wartość w gradient text (`background: var(--grad-cost); -webkit-background-clip: text; ...`)
- Karta jako `GlowFrame state="active"` jeśli wartość rośnie, `state="idle"` w przeciwnym wypadku
- Ikona w `text-primary`

- [ ] **Step 2: Smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/MetricCard.tsx
git commit -m "style(broadcast): reskin MetricCard with gradient values"
```

---

## Task 21: Reskin IssueRow

`IssueRow` ma już istniejący test. Po zmianie wizualnej test musi nadal przechodzić — sprawdzi to.

**Files:**
- Modify: `ui/src/components/IssueRow.tsx`
- Test: `ui/src/components/IssueRow.test.tsx` (zostaje bez zmian, ma przejść po reskinach)

- [ ] **Step 1: Zaktualizuj klasy**

- Tło `bg-card`, hover `bg-accent/40`
- Border bottom `border-border`
- StatusIcon i PriorityIcon zostają funkcjonalnie, ale ramy ich kontenerów w gradientowych mikro-pillach jeśli pasuje

- [ ] **Step 2: Run test (nie zmodyfikowany)**

```bash
pnpm --filter @paperclipai/ui test:run -- IssueRow
```
Expected: PASS — reskin nie złamał testów.

- [ ] **Step 3: Smoke + typecheck**

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/IssueRow.tsx
git commit -m "style(broadcast): reskin IssueRow"
```

---

## Task 22: Reskin KanbanBoard

**Files:**
- Modify: `ui/src/components/KanbanBoard.tsx`

- [ ] **Step 1: Updated visuals**

- Kolumny w `GlowFrame state="idle"`
- Karty issue w `bg-card hover:bg-accent/30 shadow-sm`
- Drag-over state: `state="active"` (glow podczas drop)

- [ ] **Step 2: Smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/KanbanBoard.tsx
git commit -m "style(broadcast): reskin KanbanBoard columns and cards"
```

---

## Task 23: Reskin ApprovalCard

**Files:**
- Modify: `ui/src/components/ApprovalCard.tsx`

- [ ] **Step 1: Updated visuals**

- Cała karta w `GlowFrame state="warning"` (bo "awaiting approval")
- Przyciski Approve/Reject w warstwie kolorystycznej broadcast (mocniejszy primary, mocniejszy destructive)
- Status icons zostają funkcjonalne, ale wokół statusu pending dodać `LiveDot status="warning" pulse`

- [ ] **Step 2: Smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ApprovalCard.tsx
git commit -m "style(broadcast): reskin ApprovalCard with warning glow"
```

---

## Task 24: Reskin LiveRunWidget

**Files:**
- Modify: `ui/src/components/LiveRunWidget.tsx`

- [ ] **Step 1: Updated visuals**

- Container w `GlowFrame state="active"` gdy aktywny run
- Header z `LiveDot status="active" pulse` + nazwa runa
- Tabela / lista runów: każda linia z hover `bg-accent/30`

- [ ] **Step 2: Smoke + typecheck**

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/LiveRunWidget.tsx
git commit -m "style(broadcast): reskin LiveRunWidget with active glow"
```

---

## Task 25: Reskin Agents list page (showcase AgentBroadcastCard w użyciu)

Agents list page (sprawdź ścieżkę: `ui/src/pages/Agents.tsx` lub `AgentsPage.tsx`) używa teraz `AgentBroadcastCard` zamiast obecnego rzędu prostych itemów.

**Files:**
- Modify: `ui/src/pages/Agents.tsx` (rzeczywista ścieżka może się różnić — znajdź podczas implementacji)

- [ ] **Step 1: Znajdź stronę listy agentów**

```bash
ls ui/src/pages/ | grep -i agent
```

- [ ] **Step 2: Zamień rendering item-ów na AgentBroadcastCard**

```tsx
import { AgentBroadcastCard } from "@/broadcast";

// w returnie:
<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
  {agents.map(a => (
    <AgentBroadcastCard
      key={a.id}
      agent={{ id: a.id, name: a.name, initials: a.name[0]?.toUpperCase() ?? "?", color: "var(--grad-agent)" }}
      status={a.status === "running" ? "active" : a.status === "idle" ? "idle" : "error"}
      currentTask={a.currentTask ?? "—"}
      cost={{ value: a.spendThisMonthUsd ?? 0, cap: a.monthlyBudgetUsd, currency: "USD" }}
      level={a.level ?? undefined}
      streakDays={a.streakDays ?? undefined}
      thoughts={a.currentThought ? [{ kind: "thought", text: a.currentThought }] : undefined}
      variant="full"
      onClick={() => navigate(`/agents/${a.id}`)}
    />
  ))}
</div>
```

**Note:** pola `level`, `streakDays`, `currentThought` nie istnieją jeszcze w schemacie Agent — przekaż `undefined`. Komponent obsługuje undefined. Te pola pojawią się w Fazie B.

- [ ] **Step 3: Smoke**

`pnpm dev` → `http://localhost:3100?broadcast=1/agents` → lista agentów w cinematic cards.

- [ ] **Step 4: Typecheck**

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/Agents.tsx
git commit -m "feat(broadcast): use AgentBroadcastCard on Agents list page"
```

---

## Task 26: Reduced-motion compliance pass

Cel: wszystkie animacje (pulse, glow, eq-wave, blink, transition) są wyłączone gdy użytkownik ma `prefers-reduced-motion: reduce`.

**Files:**
- Verify: każdy plik w `ui/src/broadcast/components/`
- Modify (jeśli czegoś brakuje): `ui/src/broadcast/tokens.css` (uniwersalna reguła reduced-motion)

- [ ] **Step 1: Dodaj uniwersalny stopper w tokens.css na końcu**

Już jest reguła `@media (prefers-reduced-motion: reduce)` w `tokens.css`. Rozszerz ją:
```css
@media (prefers-reduced-motion: reduce) {
  :root[data-theme="broadcast"] *,
  :root[data-theme="broadcast"] *::before,
  :root[data-theme="broadcast"] *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2: Manual smoke**

W DevTools → Rendering → Emulate CSS media `prefers-reduced-motion: reduce` → wejdź na `/design-guide?broadcast=1` → wszystkie animacje (eq bars, dot pulse, cursor blink) powinny być wyłączone, glow shadows wciąż widoczne (statycznie).

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter @paperclipai/ui test:run
```
Expected: wszystkie nowe testy PASS, istniejące PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/src/broadcast/tokens.css
git commit -m "style(broadcast): enforce reduced-motion across broadcast theme"
```

---

## Task 27: Manual smoke checklist + zamknięcie A1

**Files:** brak — to checklist + ewentualne fixy.

- [ ] **Step 1: Pełen typecheck całego repo**

```bash
pnpm typecheck
```
Expected: zero errors.

- [ ] **Step 2: Pełen test UI**

```bash
pnpm --filter @paperclipai/ui test:run
```
Expected: wszystkie testy PASS.

- [ ] **Step 3: Smoke checklist (uruchom `pnpm dev`)**

- [ ] Bez `?broadcast=1` aplikacja wygląda standardowo (theme classic).
- [ ] `?broadcast=1` aktywuje theme; obrysuj `<html>` w DevTools — atrybut `data-theme="broadcast"` jest.
- [ ] Flaga persystuje po odświeżeniu strony.
- [ ] `localStorage.removeItem("paperclip_broadcast")` + reload → wraca classic.
- [ ] `/design-guide?broadcast=1` pokazuje sekcję "Broadcast" — 11 komponentów się renderuje.
- [ ] Sidebar, Layout, BreadcrumbBar, CompanySwitcher wyglądają cinematic.
- [ ] MetricCard ma gradient na wartościach.
- [ ] IssueRow + KanbanBoard mają broadcast vibe.
- [ ] ApprovalCard ma warning glow.
- [ ] LiveRunWidget pulsuje gdy run aktywny.
- [ ] Agents list używa AgentBroadcastCard.
- [ ] `prefers-reduced-motion: reduce` w DevTools → animacje wyłączone, ale layout intact.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/broadcast-a1-tokens-hero
```

- [ ] **Step 5: Otwórz PR ręcznie**

`gh pr create` lub przez GitHub UI. Tytuł: `feat(broadcast): A1 — tokens + cinematic components + hero screen reskin`. Opis: link do specu + lista checklisty z Tasku 27 Step 3.

---

## Po ukończeniu A1

Po merge'u A1 do master:
- Napisz plan A2 (`docs/superpowers/plans/2026-05-24-broadcast-a2-rest-default.md`) — reszta komponentów + promote `data-theme="broadcast"` do default.
- A1 powinien zostawić aplikację w stanie "działa identycznie jak wcześniej dla wszystkich co nie wiedzą o `?broadcast=1`", więc merge jest bezpieczny.

---

**Koniec planu Faza A1.**
