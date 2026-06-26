# Ads Manager + Meta Ads Integration — Design Spec

**Data:** 2026-06-26
**Status:** Zaakceptowany (design), przed planem implementacji
**Autor:** Michał + Claude

## 1. Cel i kontekst

Utworzyć nowe stanowisko pracy **„Ads Manager"** w Paperclip oraz integrację z **Meta Marketing API** (Facebook/Instagram Ads), tak aby agent mógł **zarządzać kampaniami reklamowymi** (budżety, kampanie, pauza/wznowienie, raportowanie) w sposób bezpieczny finansowo.

Reklamy oznaczają realne wydatki, więc kluczowym wymaganiem jest, by limity i akceptacje były **egzekwowane przez system (kod serwera), a nie przez prompt agenta**.

Stan wyjściowy: w kodzie **nie ma** żadnej istniejącej integracji reklamowej (Google/Meta/marketing) — budujemy od zera.

## 2. Decyzje (ustalone w brainstormingu)

| Decyzja | Wybór |
|---|---|
| Platforma na start | **Meta Ads** (Google Ads później, ta sama architektura) |
| Zakres uprawnień | **Pełny zapis, ale w twardych granicach** |
| Wymuszane guardraile | **Cap wydatków (dzień/miesiąc)** + **audyt/log/rollback** + raportowanie do akceptacji |
| Model akceptacji | **Próg istotności** — rutyna w ramach limitów wykonuje się sama i jest logowana; istotne akcje czekają na akceptację człowieka w tasku |
| Architektura integracji | **Plugin + company skill + sekret w vaulcie** (Podejście A) |

## 3. Architektura

Cztery komponenty, każdy z jedną odpowiedzialnością:

1. **Plugin `meta-ads`** (`packages/plugins/meta-ads`) — konektor do Meta Marketing API + narzędzia (tools) dla agenta.
2. **Warstwa guardraili** (wewnątrz pluginu, server-side) — egzekwuje cap wydatków, próg istotności, audyt, rollback.
3. **Stanowisko `ads_manager`** — nowy agent (rola, prompt/instrukcje, ikona) + podpięty company skill `meta-ads-management`.
4. **Sekret + konfiguracja** — token Meta w `company_secrets` (vault); polityka (capy, progi) w `plugin_config` per firma.

### 3.1 Plugin `meta-ads` — narzędzia

Faza 1:
- **Odczyt:** `list-ad-accounts`, `list-campaigns`, `get-insights` (metryki, wydatki, wyniki).
- **Zapis:** `set-campaign-budget`, `create-campaign`, `pause-campaign`, `resume-campaign`.
- Klient API pobiera token przez `ctx.secrets.resolve(...)` — nigdy z configu agenta.
- Każde narzędzie zapisujące przechodzi przez warstwę guardraili.

Poza zakresem Fazy 1 (później): `update-adset` (targetowanie/teksty), whitelist kont, rollback UI.

### 3.2 Warstwa guardraili (kluczowa, server-side)

- **Cap wydatków** — sumuje zmiany budżetu w oknie dzień/miesiąc względem limitu z `plugin_config`; przekroczenie = blokada akcji z czytelnym komunikatem.
- **Klasyfikator istotności** — reguły bazowe: *nowa kampania*, *wzrost budżetu powyżej progu*, *pauza/wznowienie kampanii* = **istotne**. Istotne narzędzie **nie wykonuje** akcji, tylko zakłada task akceptacyjny; rutyna w ramach capa wykonuje się od razu i jest logowana.
  - Próg istotności: **do doprecyzowania na etapie planu** — domyślnie hybryda procent + kwota (np. wzrost > 20% LUB > X PLN). Konfigurowalny w `plugin_config`.
- **Audyt** — każda akcja zapisana (kto/co/kiedy/stan przed → po).
- **Rollback** — zapis stanu „przed" przy każdej zmianie; komenda/narzędzie cofnięcia ostatniej zmiany.

### 3.3 Przepływ akceptacji (próg istotności)

```
Agent woła set-campaign-budget
   → dispatcher → guardrail:
       (a) cap OK?  ── nie ──> blokada + komunikat
       (b) istotne? ── nie ──> wywołanie Meta API + audyt + wynik
                    ── tak ──> task akceptacyjny do człowieka, akcja wstrzymana
                                  → po akceptacji: agent wykonuje akcję
```

**Mechanizm akceptacji:** wpiąć w istniejący prymityw bramek/gate Paperclip (gałęzie `execution-stage-review-gates`, `gate-confirmation-...`) zamiast wymyślać własny — **do weryfikacji na etapie planu**.

### 3.4 Stanowisko „Ads Manager"

- Rola `ads_manager`, title „Ads Manager", ikona.
- Szablon instrukcji: `skills/paperclip-create-agent/references/agents/adsmanager.md` (cele: efektywność wydatków, raportowanie, kiedy pytać o akceptację).
- Podpięty company skill `meta-ads-management` (jak/kiedy używać narzędzi — uzupełnienie zachowania agenta, NIE zamiast guardraili w kodzie).
- Sekret Meta związany z agentem; plugin `meta-ads` włączony dla firmy.

## 4. Dane i konfiguracja

- **Sekret Meta:** System User long-lived access token + app id/secret + ad account id w `company_secrets`, wiązane przez `company_secret_bindings` (np. `env.META_ACCESS_TOKEN`). Szczegóły OAuth/System User — do potwierdzenia w planie.
- **Polityka guardraili:** w `plugin_config` per firma — cap dzienny, cap miesięczny, próg istotności (procent + kwota), (później) whitelist kont/kampanii.

## 5. Obsługa błędów

- Wygaśnięcie tokenu Meta → czytelny błąd + wskazanie odnowienia.
- Rate-limit Meta → backoff + komunikat.
- Przekroczony cap → akcja zablokowana z wyjaśnieniem (nie cicha porażka).
- Błędy API Meta zwracane jako jawne wyniki narzędzia.

## 6. Testy

- **Unit:** warstwa guardraili — matematyka capa (sumowanie okna dzień/miesiąc), klasyfikacja istotności (granice progów), z mockiem klienta Meta.
- **Integracyjny:** dispatch narzędzia zapisującego z fałszywym Meta API — ścieżka „wykonaj" i ścieżka „task akceptacyjny".

## 7. Zakres MVP (YAGNI)

**Faza 1 (Meta):** narzędzia odczytu + `set-budget` + pauza/wznów + `create-campaign`; cap wydatków; próg istotności; audyt; akceptacja przez task.

**Później:** whitelist kont/kampanii, rollback UI, drugi plugin **Google Ads** na tej samej architekturze, `update-adset`.

## 8. Otwarte punkty do planu implementacji

1. Dokładny mechanizm bramki akceptacji — wykorzystać istniejący gate Paperclip vs własny task.
2. Szczegóły OAuth / System User token dla Meta Marketing API.
3. Definicja progu istotności (procent vs kwota vs hybryda) i wartości domyślne.
4. Format audytu i mechanizm rollback (gdzie przechowywać stan „przed").
