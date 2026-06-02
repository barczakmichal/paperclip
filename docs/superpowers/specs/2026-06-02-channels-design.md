# Kanały zespołowe (Slack-like) + raport bieżący agentów — projekt

Data: 2026-06-02
Status: zatwierdzony do planu implementacji
Autor: Michał Barczak (brainstorm z Claude)

## 1. Cel i problem

Użytkownik potrzebuje jednego ekranu, na którym:

1. **Widzi raport bieżący** każdego pracownika-agenta (≤500 znaków): nad czym pracuje teraz i co ostatnio zrobił.
2. **Komunikuje się z agentami w kanałach tematycznych** (jak Slack): kanały działowe (#marketing, #finanse, #tech…), w których pisze wiadomości, woła agentów przez `@mention` i realnie odpala ich pracę.

Dziś częściowe substytuty istnieją (`/process` — hierarchia zadań z live aktywnością; chat przyklejony do issue), ale brakuje zbiorczego, działowego huba komunikacji i przeglądu statusów „od każdego pracownika".

## 2. Decyzje (podjęte w brainstormie)

| # | Decyzja | Wybór |
|---|---------|-------|
| 1 | Zakres iteracji | Jeden spójny ekran w stylu Slacka (kanały + raport jako panel) |
| 2 | Reakcja na wiadomość w kanale | `@mention` realnie odpala run agenta; bez mention = notatka |
| 3 | Skąd kanały | Auto ze struktury firmy (menedżer + poddrzewo `reportsTo` = dział) |
| 4 | Treść raportu ≤500 znaków | Auto z aktywności (ostatni ukończony run + `currentThought` z heartbeatu) |
| 5 | Architektura | B — pełny model `channels` / `channel_messages` |
| 6 | Most `@mention → run` | Most 1 — ukryty backing-issue per kanał, wiadomości mirrorowane |
| 7 | Layout | A — 3 kolumny, raporty w stałym prawym panelu |

## 3. Architektura — przegląd

```
Lewy rail            Środek (strumień)             Prawy panel
─────────────        ───────────────────────       ──────────────────
# ceo                wiadomości kanału             członkowie działu
# marketing  ◀──     + composer z @mention         + auto-status ≤500
# finanse                                          (Teraz / Ostatnio)
# tech
```

Trzy warstwy:

- **Dane**: nowe tabele `channels`, `channel_messages` (model B). Członkostwo NIE jest zapisywane — wyliczane z `reportsTo`.
- **Wykonanie**: `@mention` → most 1 → istniejący `heartbeat.wakeup(agentId, …)`. Run pisze do ukrytego backing-issue, odpowiedź mirrorowana do kanału.
- **Prezentacja**: nowa strona React `/channels`, realtime przez istniejący `live-events-ws` / `publishLiveEvent`.

## 4. Model danych

### 4.1 `channels`

| Pole | Typ | Uwagi |
|------|-----|-------|
| `id` | uuid PK | |
| `companyId` | uuid FK | scope firmy |
| `key` | text | slug, unikalny w firmie: `ceo`, `marketing`, `finance`… wyprowadzany z roli/menedżera |
| `name` | text | etykieta wyświetlana (`# marketing`) |
| `kind` | enum `department` \| `company` | `company` = kanał ogólnofirmowy (#ceo / #all) |
| `managerAgentId` | uuid FK null | menedżer działu; null dla kanału `company` opartego o CEO/root |
| `backingIssueId` | uuid FK null | ukryty issue-kontekst (most 1); tworzony leniwie przy 1. `@mention` |
| `archivedAt` | timestamptz null | gdy dział znika ze struktury, kanał archiwizujemy zamiast kasować |
| `createdAt`, `updatedAt` | timestamptz | |

Unikalność: `(companyId, key)`.

### 4.2 `channel_messages`

| Pole | Typ | Uwagi |
|------|-----|-------|
| `id` | uuid PK | |
| `companyId` | uuid FK | |
| `channelId` | uuid FK | |
| `authorUserId` | uuid FK null | autor-człowiek (XOR z agentId) |
| `authorAgentId` | uuid FK null | autor-agent (odpowiedź / mirror z runu) |
| `kind` | enum `message` \| `agent_reply` \| `system` | `system` = wpisy techniczne (np. „utworzono zadanie #PC-123") |
| `body` | text | markdown |
| `mentionedAgentIds` | uuid[] | sparsowane `@mention` (do podświetleń i triggera) |
| `triggeredRunId` | uuid FK null | run odpalony przez tę wiadomość |
| `backingIssueCommentId` | uuid FK null | mostek do mirrorowanego komentarza w backing-issue |
| `createdAt` | timestamptz | |

Indeks: `(channelId, createdAt)` do paginacji strumienia.

### 4.3 Migracja

Jedna migracja drizzle w `packages/db` (wzorzec istniejących migracji). Bez backfillu danych — kanały provisionują się leniwie (4.4).

## 5. Auto-provisioning i członkostwo

### 5.1 Provisioning kanałów (`channelSyncService`)

Nowa usługa `server/src/services/channels.ts`. Funkcja `syncChannelsForCompany(companyId)`:

1. Pobiera drzewo agentów (jak `agentsApi`/OrgChart — root = CEO, `reports` = poddrzewa).
2. Kanał `company` dla root/CEO (key `ceo`).
3. Kanał `department` dla każdego agenta-menedżera mającego ≥1 podwładnego (klucz z roli: `cmo→marketing`, `cfo→finance`, `cto→tech`; fallback: slug nazwy/roli).
4. Tworzy brakujące, archiwizuje kanały, których menedżer zniknął/stracił podwładnych (`archivedAt`), reaktywuje przy powrocie.

Wyzwalanie sync: leniwie przy `GET .../channels` (idempotentne, tanie) + po zmianach struktury agentów (utworzenie/zmiana `reportsTo`/usunięcie agenta). MVP: tylko leniwie na liście — wystarczy.

Mapowanie roli→klucz/nazwa: tabela stała w `packages/shared` (rozszerzalna), z fallbackiem do slugu nazwy menedżera, by uniknąć kolizji.

### 5.2 Członkostwo (wyliczane)

Brak tabeli members. Dla kanału `department` członkowie = menedżer + domknięcie `reportsTo` (całe poddrzewo). Dla `company` = wszyscy agenci firmy. Liczone serwerowo przy odczycie. Zaleta: zawsze zgodne z OrgChart, zero driftu.

## 6. Raport bieżący (auto-status ≤500)

Serwerowy builder `buildAgentStatus(agent)` (w `channels.ts` lub osobny `agent-status.ts`):

- **Teraz**: `currentThought` z aktywnego heartbeatu/runu (to samo źródło, co `/process` „Now: …"). Gdy brak aktywnego runu → status bezczynności (np. „Bezczynny").
- **Ostatnio**: krótkie podsumowanie ostatniego ukończonego runu (tytuł/summary ostatniego runu agenta).
- Złączenie + przycięcie do **500 code points** (istnieje już `truncateByCodePoint` w `issues.ts` — wydzielić/reużyć).
- Stan online: `lastHeartbeatAt` / status agenta (`paused`, `error`) → kolor kropki.

Zwracane w `GET /channels/:id/members`. Read-only w v1 (zgodnie z decyzją #4). Architektura zostawia miejsce na przyszłe nadpisanie tekstem od agenta (osobne pole), ale tego NIE budujemy teraz (YAGNI).

## 7. Most `@mention → run` (Most 1)

Punkt integracji: run odpalany istniejącym `heartbeat.wakeup(agentId, opts)` (jak `queueIssueAssignmentWakeup` w `issue-assignment-wakeup.ts`).

Przepływ przy `POST /channels/:id/messages` z `@agent`:

1. Zapis `channel_messages` (autor = user, `mentionedAgentIds` sparsowane).
2. Leniwe utworzenie `backingIssueId` dla kanału, jeśli brak (ukryty issue: `origin=channel`, tytuł = nazwa kanału, wykluczony z list issues filtrem origin).
3. Mirror wiadomości użytkownika jako komentarz w backing-issue (przypisany do `@agent`).
4. `heartbeat.wakeup(agentId, { source: "on_demand", triggerDetail: "manual", reason: "channel mention", payload: { channelId, messageId, issueId: backingIssueId }, requestedByActorType: "user", requestedByActorId: userId })`.
5. Agent budzi się w kontekście backing-issue (runtime bez zmian), wykonuje pracę, dodaje komentarz.
6. **Mirror zwrotny**: nowe komentarze agenta w backing-issue → zapisywane jako `channel_messages` (`kind=agent_reply`, `authorAgentId`, `backingIssueCommentId`, `triggeredRunId`). Realizacja przez hook na zapisie komentarza issue / subskrypcję `publishLiveEvent` runu (wybór mechanizmu w planie implementacji; preferowany: jawny mirror w warstwie serwisu przy zapisie komentarza, gdy `issue.origin=channel`).

Wiadomość bez `@mention` = sam zapis `channel_messages`, bez kroków 2–6.

„Wrzuć zadanie" (przyszłość / opcjonalnie w v1): przycisk tworzący normalny child-issue przypisany agentowi + wpis `system` z linkiem w kanale. MVP może to pominąć — `@mention` pokrywa „każ coś zrobić".

### 7.1 Wykluczenie backing-issues z UI issues

Backing-issue oznaczony przez **rozszerzenie `originKind`** (realne pole w `packages/db/src/schema/issues.ts`; istniejące wartości: `manual`, `routine_execution`, …) o nową wartość `channel`. Plan musi zdecydować: nowa wartość `originKind=channel` vs. osobna flaga `isChannelBacking` — i odpowiednio zaktualizować filtry list/wyszukiwarek issues, które keyują po `originKind`. Preferencja: `originKind=channel` (spójne z istniejącym wzorcem). To jedyny „dług semantyczny" modelu B z mostem 1 — świadomy i odizolowany.

## 8. API (REST, wzorzec istniejących routes)

`server/src/routes/channels.ts`, rejestrowane w `routes/index.ts`:

- `GET  /companies/:companyId/channels` → lista kanałów (po sync), nieprzeczytane liczniki opcjonalnie.
- `GET  /channels/:channelId/members` → członkowie + `status` (≤500) + stan online.
- `GET  /channels/:channelId/messages?before=&limit=` → strumień (paginacja malejąco po `createdAt`).
- `POST /channels/:channelId/messages` body `{ body }` → zapis + (jeśli `@mention`) most 1.

Autoryzacja: ten sam guard co issues/agents (scope firmy, członkostwo). Testy authz wg `*-routes-authz.test.ts`.

Klient UI: `ui/src/api/channels.ts` (wzorzec `api/issues.ts`), `queryKeys.channels.*`.

## 9. Realtime

Reużycie `publishLiveEvent({ companyId, … })` + `subscribeCompanyLiveEvents` (WS `live-events-ws.ts`). Nowe typy zdarzeń:

- `channel_message_created` (nowa wiadomość — własna i agenta).
- `channel_status_updated` (zmiana `currentThought`/zakończenie runu członka).

UI subskrybuje istniejącym kanałem WS i invaliduje/aktualizuje react-query (wzorzec jak `liveRuns` w `/process`, `refetchInterval` jako fallback).

## 10. UI (Layout A — 3 kolumny)

Nowa strona `ui/src/pages/Channels.tsx`, trasa w `App.tsx` `boardRoutes()` (`<Route path="channels" element={<Channels />} />`) + pozycja w nawigacji bocznej. Skill `design-guide` + `frontend-design` przy implementacji.

- **Lewy rail**: lista kanałów (`# nazwa`), aktywny podświetlony, licznik nieprzeczytanych (opcjonalnie v1.1).
- **Środek**: strumień wiadomości (lekki renderer — `MarkdownBody`, `Identity`, `AgentIcon`; NIE pełny `IssueChatThread`) + composer z mentions (`MentionOption`, jak w issue chat). Bąbelki: user vs `agent_reply` rozróżnialne; `system` jako cienki wpis.
- **Prawy panel**: karty członków — `Identity` + kropka stanu + „Teraz: …" / „Ostatnio: …" (≤500, line-clamp z rozwijaniem). Klik karty → przyszłościowo profil/`/agents/:id`.
- Stany: brak firmy / brak kanałów (EmptyState), skeleton (PageSkeleton).
- i18n: namespace `channels`, wzorzec test-safe `lng=pl` (jak reszta projektu).

## 11. Testy

- **Server service**: `syncChannelsForCompany` (tworzy/archiwizuje wg struktury), członkostwo z `reportsTo`, `buildAgentStatus` (truncacja 500 cp, brak runu), `POST messages` z `@mention` woła `heartbeat.wakeup` z poprawnym payloadem (mock), mirror zwrotny tworzy `agent_reply`.
- **Route authz**: `channels-routes-authz.test.ts` wg istniejącego wzorca.
- **UI**: render Channels (rail/stream/panel), post wiadomości, panel statusu renderuje ≤500, mention podświetlony. Wzorzec `*.test.tsx` z `lng=pl`.

## 12. Poza zakresem (YAGNI w v1)

- Ręczne tworzenie/edycja kanałów (decyzja #3: tylko auto).
- Agent samodzielnie piszący własny raport (decyzja #4: tylko auto; architektura zostawia miejsce).
- Most 2 (natywny kontekst channel w runtime).
- Wątki/reakcje/edycja wiadomości, załączniki w kanale (można dołożyć później — issue chat ma wzorce).
- Liczniki nieprzeczytanych / badge w sidebarze (miłe, nie krytyczne — v1.1).

## 13. Ryzyka

1. **Dług semantyczny backing-issue** — izolowany przez `originKind=channel` + filtrami; akceptowalny.
2. **Mirror zwrotny** — najtrudniejszy element; wymaga pewnego hooka na zapis komentarza issue gdy `origin=channel`. Plan implementacji musi go domknąć przed UI.
3. **Mapowanie roli→klucz kanału** — kolizje (dwóch menedżerów „marketing"); fallback do slugu nazwy menedżera.
4. **Koszt runów** — `@mention` odpala realny run; UI musi jasno sygnalizować „to uruchomi agenta" (jak w issue chat).
```
