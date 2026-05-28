# Paperclip: widoczność procesu + pełne PL

Data: 2026-05-28
Status: zatwierdzony do wdrożenia (użytkownik poprosił o przejście od razu do speca i wdrożenia)

## Kontekst i problem

Sklep wędkarski (`SKL`) to firma prowadzona przez agentów AI (CEO, CMO, CTO, Head of Product). Podczas testów lokalnych użytkownik zgłosił, że **nie rozumie co dzieje się w aplikacji**:

1. Nie widać nad czym agent pracuje — karty agentów pokazują tylko `succeeded / Finished 7m ago` z pustym ciałem.
2. Brak widoku całego procesu (zlecenie → CEO deleguje → podagenci → approval → wynik).
3. Dashboard nieczytelny — metryki są, ale nie wiadomo co z nich wynika.
4. Powiązania zadań niejasne — nie widać hierarchii (`SKL-1` „Stwórz zespół" → podzadania `SKL-2..7`) ani zależności.

Dodatkowo dwa bugi i jeden duży brak:

- **Kodowanie**: tytuły/treści tworzone przez agentów na Windows zapisują się z `�` (U+FFFD) zamiast polskich znaków, część z diakrytykami całkiem usuniętymi. Tekst wpisywany przez człowieka w UI jest poprawny.
- **Routing**: `/marketing` i `/live` dają „Company not found", bo nie są w `BOARD_ROUTE_ROOTS` i router traktuje je jako prefix firmy.
- **Brak i18n**: UI w całości po angielsku, zero frameworka tłumaczeń (311 plików `.tsx`).

## Kluczowe odkrycie

Dane potrzebne do pokazania „co agent robi" **już istnieją** w bazie — przebudowa to głównie frontend:

- `heartbeat_runs`: `currentThought`, `currentTool`, `currentThoughtUpdatedAt`, `nextAction`, `currentCostCents`, `triggerDetail`, `contextSnapshot.issueId`, `status`, `startedAt`/`finishedAt`.
- `heartbeat_run_events`: strumień kroków (`seq`, `eventType`, `message`, `payload`, `level`).
- `issues`: `parentId` (hierarchia), `goalId`, `executionRunId`, oraz tabela `issue_relations` (typ `blocks`).
- Endpoint `/companies/:id/live-agents` (Live Ops) zwraca już `currentThought`/`currentTool`; endpoint dashboardu `/companies/:id/live-runs` ich nie zwraca.
- `AgentBroadcastCard` (Live Ops) już ładnie renderuje `currentTask` + `ThoughtStream` + `currentTool` + koszt. Dashboardowy `AgentRunCard` renderuje surowy transkrypt (`RunChatSurface`) — to źródło nieczytelności.

## Architektura inicjatywy — jedna inicjatywa, 3 fazy

Pełne i18n 311 plików nie może być w tym samym specu co redesign UI. Inicjatywa rozbita na fazy realizowane po kolei, każda osobno testowalna:

| Faza | Zakres | Zależność |
|---|---|---|
| **F0 — Bugfixy** | routing `/marketing` `/live`; root-cause + fix kodowania agentów na Windows | brak |
| **F1 — Widoczność procesu** (rdzeń) | strukturalne karty agentów, widok procesu (drzewo zadań + live overlay), czytelny dashboard, powiązania zadań | F0 (czyste dane do testów) |
| **F2 — Pełne i18n PL** | framework + tłumaczenie UI, domyślny język polski | F1 (UI stabilne, tłumaczymy raz) |

---

## F0 — Bugfixy

### F0.1 Routing `/marketing` i `/live`
**Plik:** `ui/src/lib/company-routes.ts`
- Dodać `"marketing"` i `"live"` do `BOARD_ROUTE_ROOTS`.
- Skutek: `extractCompanyPrefixFromPath` przestaje traktować je jak prefix firmy; `isBoardPathWithoutPrefix` zwraca `true`; istniejący `UnprefixedBoardRedirect` (`ui/src/App.tsx`) przekieruje `/marketing` → `/<aktywna-firma>/marketing`.
- Weryfikacja: `UnprefixedBoardRedirect` faktycznie obejmuje te ścieżki (dopisać `live` i `marketing` do listy przekierowań w `App.tsx`, jeśli jest tam jawna lista, a nie generyczne `isBoardPathWithoutPrefix`).

### F0.2 Kodowanie polskich znaków z agentów (Windows)
**Plik źródłowy:** `packages/adapter-utils/src/server-utils.ts:1703` (spawn subprocess agenta), adapter `packages/adapters/claude-local/src/server/`.
- **Najpierw reprodukcja** (systematic-debugging): uruchomić agenta, który tworzy issue z polskim tekstem, i zaobserwować w którym punkcie bajty UTF-8 się psują. Hipoteza: stdout dziecka na Windows w code page systemowym (cp1250) zamiast UTF-8, albo prompt na stdin wysyłany bez UTF-8.
- **Kandydaci na fix** (wybrać po reprodukcji):
  - Ustawić środowisko dziecka: `PYTHONIOENCODING=utf-8`, `LANG`/`LC_ALL=C.UTF-8`, ewentualnie wymusić `chcp 65001` przy spawnie na Windows.
  - Upewnić się że stdin (prompt) zapisywany jest jako UTF-8 (`Buffer.from(prompt, "utf8")`).
  - Zweryfikować że `StringDecoder("utf8")` dostaje surowe, niezdekodowane bajty (że pipe jest binarny, nie przepuszczony przez code page).
- **Dane już uszkodzone** (`SKL-2..7`): U+FFFD = bajty utracone, nie da się auto-naprawić. Naprawa: usunąć i pozwolić agentom odtworzyć, albo ręcznie poprawić tytuły. Decyzja w trakcie wdrożenia (najprościej: poprawić ręcznie kilka tytułów testowych).

---

## F1 — Widoczność procesu (rdzeń)

### F1.1 Strukturalne karty agentów (pain 1)
**Backend:** `server/src/routes/agents.ts` (endpoint `/companies/:id/live-runs`) + `ui/src/api/heartbeats.ts` (`LiveRunForIssue`).
- Rozszerzyć zapytanie i typ `LiveRunForIssue` o: `currentThought`, `currentTool`, `currentThoughtUpdatedAt` (pola już istnieją na `heartbeat_runs`, dochodzą do `SELECT`).

**Frontend:** nowy reużywalny composite `ui/src/components/AgentActivitySummary.tsx`.
- Pokazuje strukturalnie zamiast surowego logu:
  - **Cel**: linkowane issue (`run.issueId` → tytuł). Label „Cel".
  - **Teraz**: `currentThought` (co robi w tej chwili). Label „Teraz".
  - **Narzędzie**: `currentTool` jako chip mono (wzorzec z `AgentBroadcastCard`).
  - **Następny krok**: `nextAction`. Label „Następny krok".
  - Stan/kropka live + elapsed + koszt (zachowane z obecnej karty).
- `AgentRunCard` (w `ActiveAgentsPanel.tsx`) renderuje `AgentActivitySummary` w ciele zamiast `RunChatSurface`. Pełny transkrypt dostępny pod istniejącym linkiem do run detail (`/agents/:id/runs/:runId`).
- Tokeny z design-guide: `text-xs text-muted-foreground` na labelach, status dots wg sekcji 5, chip narzędzia jak w broadcast card.
- Dodać `AgentActivitySummary` do `/design-guide`.

### F1.2 Widok procesu (pain 2 + 4)
**Nowa strona:** `ui/src/pages/Process.tsx`, route `/process` (board route, wymaga prefixu firmy → dopisać `"process"` do `BOARD_ROUTE_ROOTS`).
- Pokazuje **drzewo zadań** firmy z live overlay:
  - Top-level issues (cele) → podzadania (`parentId`), wcięcie hierarchiczne.
  - Każdy węzeł: `StatusIcon` + identyfikator + tytuł + przypisany agent + (jeśli `executionRunId` i run aktywny) mini wskaźnik „Teraz: {currentThought}" + badge approval jeśli pending.
  - Zależności (`issue_relations` typ `blocks`): wskaźnik „blokuje / zablokowane przez" przy węźle (np. ikona + tooltip).
- Wzorzec: „Grouped List" + „Entity Row" z design-guide. Reużyć `StatusIcon`, `StatusBadge`, `Identity`, `PriorityIcon`.
- Wejście z sidebar (sekcja WORK) + link z dashboardu.
- Dane: `issuesApi.list` (ma `parentId`, `goalId`, `executionRunId`) + `issue_relations` (sprawdzić endpoint; jeśli brak listy relacji per-company, dodać lekki `GET /companies/:id/issue-relations` lub dołączyć relacje do issue detail). Live status: `heartbeatsApi.liveRunsForCompany`.

### F1.3 Czytelny dashboard (pain 3)
**Plik:** `ui/src/pages/Dashboard.tsx`.
- Przeorganizować hierarchię: u góry sekcja „Co się teraz dzieje" = `ActiveAgentsPanel` ze strukturalnymi kartami (F1.1), z linkiem „Zobacz cały proces" → `/process`.
- Metryki (`AGENTS ENABLED / TASKS IN PROGRESS / MONTH SPEND / PENDING APPROVALS`) zostają, ale pod sekcją live, z czytelnymi labelami.
- Reszta (wykresy, recent activity, recent tasks) bez zmian strukturalnych.

### F1.4 Powiązania zadań na issue detail (pain 4)
**Plik:** issue detail page (zlokalizować, np. `ui/src/pages/IssueDetail.tsx`).
- Sekcja „Powiązania": parent, dzieci (`parentId`), blokuje / zablokowane przez (`issue_relations`), cel (`goalId`).
- Wzorzec „Property Row". Sprawdzić czy część już istnieje (relacje mogą być częściowo renderowane) — uzupełnić brakujące.

---

## F2 — Pełne i18n PL

**Framework:** `react-i18next` (+ `i18next`).
- Setup: `I18nextProvider` w `ui/src/main.tsx`/`App.tsx`, instancja w `ui/src/lib/i18n.ts`, domyślny język `pl`, fallback `en`.
- Słowniki: `ui/src/locales/pl.json`, `ui/src/locales/en.json` (struktura kluczy namespace'owana per obszar: `nav`, `dashboard`, `process`, `marketing`, `issues`, `agents`, `common`).
- Strategia wdrożenia (przyrostowa, bo ~311 plików / 1500-2500 stringów):
  1. Infra + wrap aplikacji.
  2. Tłumaczenie obszarów o najwyższym ruchu i tych dotkniętych F1: nawigacja/sidebar, Dashboard, Process, karty agentów, Marketing, statusy/przyciski (`common`).
  3. Pozostałe komponenty mechanicznie (każdy: zamiana literałów na `t("key")` + wpis w słownikach).
- Statusy/priorytety: tłumaczyć etykiety wyświetlane, zachować wartości techniczne (`in_progress` itd.) w danych.

## Decyzje projektowe (podjęte)

- Karty agentów: **strukturalny summary** (Cel/Teraz/Narzędzie/Następny krok), nie surowy log. Log pod linkiem do run detail.
- Widok procesu: **drzewo zadań z live overlay**, osobna strona `/process`, nie rozbudowa Live Ops (Live Ops zostaje widokiem „broadcast" agentów; Process to widok pracy/zadań).
- i18n: **react-i18next**, domyślnie PL, wdrażane przyrostowo, po F1.
- Kodowanie: fix u źródła (spawn/encoding), uszkodzone dane testowe poprawiane ręcznie.

## Testowanie

- F0.1: `/marketing`, `/live` bez prefixu → przekierowanie do `/SKL/...`, brak „Company not found".
- F0.2: agent tworzy issue z polskim tekstem → tytuł w bazie z poprawnymi diakrytykami (reprodukcja przed i po).
- F1: dev server `127.0.0.1:3100`, firma `SKL` — karty agentów pokazują Cel/Teraz/Następny krok; `/SKL/process` pokazuje drzewo `SKL-1 → SKL-2..7` z live status; dashboard czytelny.
- F2: przełączenie języka, brak gołych kluczy `t("...")` na przetłumaczonych ekranach.

## Poza zakresem (YAGNI)

- Edycja/zmiana modelu wykonania agentów (dane już wystarczają).
- Pełny graf zależności z biblioteką do wizualizacji — na razie drzewo + wskaźniki blokad.
- Tłumaczenie treści generowanych przez agentów (tylko UI chrome).
