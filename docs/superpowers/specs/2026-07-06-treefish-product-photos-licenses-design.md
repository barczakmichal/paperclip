# Treefish: Typowane zdjęcia produktów + licencje Makerworld — Design Spec

**Data:** 2026-07-06
**Status:** Zaakceptowany (design), przed planem implementacji
**Autor:** Michał + Claude
**Dotyczy:** sklep treefish.pl (Next.js + Prisma + PostgreSQL, VPS Hostinger 148.230.71.59, deploy przez SSH — NIE ten monorepo; kod sklepu żyje na GitHubie i VPS `/opt/treefish`) + proces agentów SKL w Paperclip.

## 1. Cel i kontekst

Sklep treefish.pl sprzedaje wydruki 3D modeli pochodzących w większości z Makerworld. Dwa problemy:

1. **Zdjęcia produktu** — galeria wielu zdjęć istnieje (SKL-110/138/139), ale zdjęcia są nietypowane. Wymóg: każdy produkt prezentuje klientowi trzy główne ujęcia — **reklamowe** (hero), **packshot**, **realny wydruk** (przykład) — plus klasyczny opis.
2. **Licencje** — produkty dodają automatycznie agenci AI (Paperclip/SKL), a znaczna część modeli Makerworld ma licencje Creative Commons z wariantem **NC (non-commercial)**, który zakazuje sprzedaży wydruków. Sklep nie przechowuje dziś żadnych danych licencyjnych — sprzedaż odbywa się w ciemno. Dodatkowo admin potrzebuje szybkiego przejścia do oryginalnego pliku na Makerworld, żeby uruchomić druk.

Kluczowe uwarunkowanie procesu: **Michał nie dodaje produktów** — robią to agenci. Dane licencyjne musi więc wypełniać agent przy tworzeniu produktu, a sklep musi to egzekwować serwerowo (walidacja API), nie dyscypliną ręczną.

## 2. Decyzje (ustalone w brainstormingu)

| Decyzja | Wybór |
|---|---|
| Produkt z licencją zakazującą sprzedaży | **Ukryty z publicznego sklepu** do czasu decyzji; w adminie czerwona flaga |
| Źródło danych licencyjnych | **Agent dodający produkt** odczytuje licencję ze strony modelu Makerworld i wypełnia pola; API sklepu odrzuca create bez nich |
| Typy zdjęć | **Typowane sloty na istniejącej galerii** (marketing / packshot / real_print / other), minimum te 3 typy; więcej zdjęć dozwolone |
| Kolejność wdrożenia | **Backfill licencji istniejących produktów PRZED włączeniem bramki publikacji** — żeby sklep nie opustoszał w dniu wdrożenia |

## 3. Architektura

Dwie współpracujące części: zmiany w kodzie sklepu (schema + API + storefront + admin) i zmiany w procesie agentów SKL (reguła + backfill).

### 3.1 Model danych (Prisma, sklep)

**Product** — nowe pola:
- `makerworldUrl: String?` — URL strony modelu na Makerworld (null dla modeli własnych)
- `licenseType: LicenseType` — enum: `CC0`, `CC_BY`, `CC_BY_SA`, `CC_BY_NC`, `CC_BY_NC_SA`, `CC_BY_ND`, `CC_BY_NC_ND`, `STANDARD_DIGITAL_FILE`, `OWN_MODEL`, `UNKNOWN` (default `UNKNOWN`)
- `commercialUse: Boolean` — wyliczany z `licenseType` przy zapisie (funkcja mapująca w jednym miejscu; NC-warianty i UNKNOWN → false; CC0/CC_BY/CC_BY_SA/OWN_MODEL → true; CC_BY_ND → false, bo wydruk bywa traktowany jako utwór zależny — bezpieczne domyślne, do ręcznego nadpisania; STANDARD_DIGITAL_FILE → false domyślnie, licencja Makerworld standard nie zezwala na sprzedaż fizycznych wydruków bez planu komercyjnego), zapisany w bazie żeby filtry były tanie; ręczne nadpisanie możliwe przez pole `commercialUseOverride: Boolean?` (null = wyliczenie automatyczne)
- `licenseVerifiedAt: DateTime?`, `licenseVerifiedBy: String?` — kto/kiedy potwierdził (id agenta lub "admin")

**Zdjęcie produktu** (istniejący model galerii) — nowe pole:
- `type: PhotoType` — enum: `MARKETING`, `PACKSHOT`, `REAL_PRINT`, `OTHER` (default `OTHER`)

Migracja: istniejące produkty dostają `licenseType = UNKNOWN`, istniejące zdjęcia `type = OTHER`. To celowo NIE ukrywa niczego samo w sobie — patrz 3.5 (feature flag bramki).

### 3.2 Bramka publikacji (serwerowa)

Publiczne endpointy sklepu (listing, strona produktu, wyszukiwarka, feed do Meta Catalog jeśli/gdy powstanie) filtrują `effectiveCommercialUse = commercialUseOverride ?? commercialUse`. Filtr w zapytaniach (Prisma `where`), nie w UI — produkt zablokowany nie wycieka przez API. Admin API widzi wszystko.

Bramka włączana flagą środowiskową `LICENSE_GATE_ENABLED` (default `false` do czasu zakończenia backfillu — sekcja 5).

### 3.3 Strona produktu (storefront)

- Hero: zdjęcie `MARKETING`; sekcja galerii prezentuje `PACKSHOT` i `REAL_PRINT` jako wyróżnione ujęcia z podpisami ("Packshot", "Przykładowy wydruk"), pozostałe zdjęcia (`OTHER`) w karuzeli za nimi.
- Fallback bez dziur: brak zdjęcia danego typu → następne dostępne zdjęcie galerii wskakuje na jego miejsce, bez pustych slotów.
- Reszta strony (opis, cena, warianty) bez zmian.

### 3.4 Admin

Rozszerzenie istniejącego admin CRUD produktów:
- Klikalny link `makerworldUrl` (otwiera w nowej karcie — szybkie przejście do druku).
- Pola licencji: select `licenseType`, podgląd wyliczonego `commercialUse`, checkbox nadpisania (`commercialUseOverride`), znacznik weryfikacji.
- Czerwona flaga na liście produktów: "licencja blokuje sprzedaż" gdy `effectiveCommercialUse = false`.
- Wskaźniki braków zdjęć: badge "brak packshota" / "brak zdjęcia wydruku" / "brak zdjęcia reklamowego" przy produkcie.
- Możliwość ustawienia `type` przy każdym zdjęciu galerii.

Walidacja create (API): nowy produkt wymaga `makerworldUrl` + `licenseType ≠ UNKNOWN` **albo** `licenseType = OWN_MODEL` (wtedy URL zbędny). Update nie wymusza (żeby backfill i korekty były możliwe polami cząstkowymi).

### 3.5 Proces agentów SKL (Paperclip)

1. **Reguła procesu:** agent dodający produkt musi wejść na stronę modelu Makerworld, odczytać licencję i przekazać `makerworldUrl` + `licenseType` w create. Reguła zapisana jako fakt `product-license-policy` w dokumencie wiedzy firmy SKL (feature company-knowledge-document, wdrożony 2026-07-06) oraz w instrukcjach/skillu agenta odpowiedzialnego za produkty.
2. **Backfill (SKL task):** przejść wszystkie istniejące produkty, dla każdego ustalić stronę Makerworld, uzupełnić `makerworldUrl` + `licenseType` + `licenseVerifiedAt/By`. Produkty nie do namierzenia → oznaczyć do decyzji Michała (komentarz w tasku).
3. **Włączenie bramki:** po zamknięciu backfillu — `LICENSE_GATE_ENABLED=true` na VPS. Dopiero wtedy produkty NC/UNKNOWN znikają z witryny.

## 4. Kolejność wdrożenia (istotna)

1. Schema + migracja + API + admin + storefront (bramka za flagą, wyłączona) → deploy.
2. Reguła dla agentów + fakt w dokumencie wiedzy + task backfill.
3. Po backfillu: przegląd flagowanych produktów przez Michała → włączenie `LICENSE_GATE_ENABLED`.

Sklep w żadnym momencie nie pustoszeje; nowe produkty od kroku 1 mają już wymuszone dane licencyjne.

## 5. Obsługa błędów i brzegowe przypadki

- Create bez licencji → 400 z czytelnym komunikatem (agent dostaje jasny sygnał co uzupełnić).
- `commercialUseOverride` pozwala ręcznie odblokować produkt mimo ostrożnego mapowania (np. autor modelu udzielił indywidualnej zgody) — zmiana odnotowana (`licenseVerifiedBy`).
- Produkt OWN_MODEL bez `makerworldUrl` — poprawny (modele własne).
- Bramka wyłączona → zachowanie sklepu identyczne jak dziś (zero ryzyka regresji przy deployu kroku 1).

## 6. Testy

- Unit: funkcja mapująca `licenseType → commercialUse` (wszystkie warianty enum), logika `effectiveCommercialUse` z override.
- API: create bez licencji → 400; create OWN_MODEL bez URL → OK; publiczny listing z włączoną bramką nie zwraca produktów NC/UNKNOWN; admin API zwraca wszystko.
- Storefront: strona produktu z kompletem 3 typów; fallback przy brakach.

## 7. Zakres MVP (YAGNI)

**W zakresie:** pola licencyjne + typy zdjęć + bramka za flagą + admin + walidacja create + reguła agentów + task backfill.

**Poza zakresem (odłożone):** automatyczny scraping licencji ze stron Makerworld, wymiana zdjęć `REAL_PRINT` na zdjęcia własnych wydruków (zalecenie: zdjęcia cudzych wydruków pobrane z Makerworld same bywają wątpliwe licencyjnie — do osobnej inicjatywy fotograficznej), okresowa re-weryfikacja licencji (autor może zmienić licencję), obsługa innych platform niż Makerworld.

## 8. Otwarte punkty do planu implementacji

1. **Wykonawca:** agenci SKL (CTO/Developer — znają kod sklepu, mają SSH) vs implementacja lokalna pętlą subagentów (wymaga klonu repo sklepu z GitHuba) — do decyzji Michała przy planie; kod sklepu NIE istnieje lokalnie.
2. Dokładna nazwa/kształt istniejących modeli Prisma sklepu (Product, tabela zdjęć) — do potwierdzenia na żywym repo w pierwszym kroku planu.
3. Czy admin sklepu ma auth wystarczający do rozróżnienia "admin" vs "agent" w `licenseVerifiedBy` — do sprawdzenia w kodzie.
