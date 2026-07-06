# Company Knowledge Document — Design Spec

**Data:** 2026-07-06
**Status:** Zaakceptowany (design), przed planem implementacji
**Autor:** Michał + Claude

## 1. Cel i kontekst

Agenci Paperclip nie mają trwałego, wspólnego "stanu wiedzy o firmie" — każdy heartbeat częściowo odtwarza kontekst od zera z wątków komentarzy i kodu. W praktyce to prowadzi do kosztownych sprzeczności: w firmie SKL (treefish.pl) jeden agent 2026-07-02 stwierdził "sklep to statyczny eksport, zero backendu" po analizie złego katalogu (`3dfish-sklep/` legacy zamiast `3dfish-store/` produkcja), co CEO musiał ręcznie prostować w kolejnej iteracji planu. Cztery dni później inny agent odkrył od nowa, że backend (Stripe checkout, Prisma) **już istnieje**. Ten wzorzec — odkrywanie tych samych faktów od zera, czasem z błędnymi wnioskami — jest głównym objawem "gubienia wątków" zgłoszonym przez operatora.

Celem jest trwały, per-firma dokument wiedzy, wstrzykiwany automatycznie do kontekstu każdego heartbeatu, żeby agenci nie odtwarzali od zera tego co już ustalono.

## 2. Decyzje (ustalone w brainstormingu)

| Decyzja | Wybór |
|---|---|
| Zakres rozwiązania | **Opcja A (pełna)** — pierwszoklasowy koncept, nie prowizorka na pinned issue |
| Właściciel treści | **Hybryda** — sekcja automatyczna (fakty punktowe) + sekcja ręczna (CEO, narracyjne podsumowania po milestone'ach) |
| Mechanizm sekcji automatycznej | **Agent aktualizuje fakt po fakcie** przez małe API PATCH — bez osobnej rutyny/crawlera |
| UI | **Brak w v1** — tylko API + agent (CEO). Ekran w Paperclip UI odłożony na później |
| Limit rozmiaru | **Brak twardego limitu** — ostrzeżenie w heartbeat-context gdy dokument jest duży/nieaktualny, przycinanie ręczne (CEO) |
| Zasięg | **Wszystkie firmy od razu** — ogólna funkcja produktu, bez feature flagi |

## 3. Architektura

Rozwiązanie **nie wprowadza nowego silnika dokumentów** — reużywa istniejący, już company-scoped prymityw `documents`/`document_revisions` (ten sam, którego dziś używają `issue_documents` do planów). Dodajemy tylko:

1. **`company_documents`** (nowa tabela-łącznik) — mirror `issue_documents`, ale bez `issueId`: `companyId + key → documentId`. Unikalny indeks na `(companyId, key)`. Kanoniczny dokument wiedzy używa `key = "knowledge"`; schemat wspiera więcej kluczy per firma na przyszłość (nie budujemy tego teraz, YAGNI).
2. **`company_document_facts`** (nowa tabela) — ustrukturyzowane fakty: `id, companyId, documentKey, factKey, value, updatedByAgentId, updatedByUserId, updatedAt`. Unikalny indeks na `(companyId, documentKey, factKey)` — każdy fakt to własny wiersz, więc dwaj agenci mogą jednocześnie zapisywać różne fakty bez wyścigu. Ten sam `factKey` nadpisywany = last-write-wins (fakty to zrzut aktualnego stanu, nie log historii — historia i tak żyje w `document_revisions` dla sekcji ręcznej i w audit trail runów).

### 3.1 Komponenty

- `packages/db/src/schema/company_documents.ts` — nowa tabela (mirror `issue_documents.ts`)
- `packages/db/src/schema/company_document_facts.ts` — nowa tabela faktów
- `server/src/services/company-documents.ts` — `getDocument(companyId, key)`, `putDocument(companyId, key, body, baseRevisionId)`, `upsertFact(companyId, key, factKey, value, actor)`, `renderDocument(companyId, key)` (skleja ręczny markdown + wyrenderowaną listę faktów + metadane świeżości/rozmiaru)
- `server/src/routes/company-documents.ts`:
  - `GET /api/companies/:companyId/documents/:key`
  - `PUT /api/companies/:companyId/documents/:key` (rewizjonowany, `baseRevisionId` jak w issue documents)
  - `PATCH /api/companies/:companyId/documents/:key/facts` — body `{ factKey: string, value: string }`, upsert jednego faktu
- Rozszerzenie istniejącego `GET /api/issues/:issueId/heartbeat-context` — dokłada wyrenderowany dokument `knowledge` swojej firmy do odpowiedzi.

## 4. Przepływ danych

1. **Agent odkrywa trwały fakt** (np. "stack: Next.js + PostgreSQL + Prisma na VPS Hostinger, NIE Vercel") → `PATCH /api/companies/:id/documents/knowledge/facts { factKey: "backend_stack", value: "..." }`. Upsert, brak potrzeby read-modify-write całego dokumentu.
2. **CEO aktualizuje narrację** po większym milestone/odkryciu → `PUT /api/companies/:id/documents/knowledge` z nowym ręcznym markdown body, z `baseRevisionId` ostatniej znanej rewizji (ten sam wzorzec optimistic-concurrency co dziś w planach issue) — konflikt = 409, każ pobrać najnowszą wersję i spróbować ponownie.
3. **Każdy heartbeat-context** — serwer pobiera dokument `knowledge` (jeśli istnieje) + wszystkie jego fakty, renderuje: ręczny markdown + sekcja `## Fakty` (lista `factKey: value` posortowana alfabetycznie) + nagłówek z `updatedAt` i długością w znakach. Jeśli `updatedAt` starsze niż 30 dni LUB długość przekracza próg ostrzegawczy (np. 4000 znaków) — dopisuje jednoliniowe ostrzeżenie na górze (nie blokuje, nie przycina).

## 5. Obsługa błędów i brzegowe przypadki

- Brak dokumentu dla firmy → `heartbeat-context` zwraca pustą/nieobecną sekcję, żadnego 404. Pierwszy `PATCH` faktu albo `PUT` dokumentu tworzy go leniwie.
- Izolacja firm: każdy request wymaga `companyId` z tokenu agenta/usera zgodnego z `companyId` w URL — jak wszędzie indziej w API (żadnej nowej logiki autoryzacji, reużycie istniejącego middleware).
- Konflikt rewizji przy `PUT` (ktoś inny zapisał w międzyczasie) → 409, standardowy wzorzec `baseRevisionId` z issue documents.
- `PATCH facts` nie ma konfliktów rewizji — to celowo prosty upsert per klucz, nie dokument z historią.

## 6. Testy

- **Unit (`company-documents` service):** get/put z rewizjami, upsert faktu (insert + update tego samego `factKey`), próg ostrzeżenia rozmiaru/świeżości w `renderDocument`.
- **Route:** autoryzacja (agent/user spoza firmy dostaje 403/404), izolacja firm (dokument firmy A niewidoczny przez API firmy B), 409 na konflikt rewizji.
- **Integracyjny:** `heartbeat-context` dla istniejącej firmy z dokumentem i faktami zwraca poprawnie sklejoną treść + ostrzeżenie gdy dokument przekracza próg.

## 7. Zakres MVP (YAGNI)

**W zakresie:** tabela `company_documents` + `company_document_facts`, serwis, 3 endpointy, wstrzyknięcie do `heartbeat-context`, ostrzeżenie o rozmiarze/świeżości.

**Poza zakresem (odłożone):** dedykowany ekran UI, automatyczna rutyna/crawler audytujący repo, wsparcie dla wielu dokumentów per firma poza kluczem `knowledge`, twarde przycinanie/limitowanie rozmiaru, historia faktów (tylko `document_revisions` dla sekcji ręcznej ma historię).

## 8. Otwarte punkty do planu implementacji

1. Dokładny próg "duży dokument" i "nieaktualny" (liczby: znaki / dni) — proponowane 4000 znaków / 30 dni, do potwierdzenia w planie.
2. Format renderowania sekcji faktów w markdown (lista vs tabela) — szczegół implementacyjny.
3. Czy `PATCH facts` powinien być dostępny dla wszystkich agentów firmy, czy tylko dla ról z określonym uprawnieniem (np. CEO/CTO) — do ustalenia przy pisaniu planu, żeby nie każdy agent mógł zaśmiecać sekcję auto.
