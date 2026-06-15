---
name: postaw-lokalnie
description: >
  Launch and run the Paperclip app locally on this machine (Windows). Use when the
  user says "postaw lokalnie", "uruchom lokalnie", "odpal aplikację", or asks to
  start/run the app and verify it works (including channels / kanały). Brings up the
  API + UI at http://127.0.0.1:3100 with the embedded Postgres, auto-applies
  migrations, recovers from the known stale-postgres hang, and verifies channels.
---

# Postaw lokalnie — niezawodny start Paperclip

Cel: jednym przebiegiem postawić aplikację lokalnie tak, żeby **na pewno** działała,
łącznie z kanałami (kanały zespołowe). Procedura jest idempotentna — można ją
powtórzyć w dowolnym momencie.

Wymagania: Node 20+, pnpm 9.15+. Serwer słucha na `http://127.0.0.1:3100`
(API pod `/api`, UI w root). Dane (firmy, agenci, kanały) siedzą w lokalnym
wbudowanym Postgresie w `C:\Users\<user>\.paperclip\instances\default\db`.

## Procedura (wykonaj po kolei)

### 1. Pobierz najnowszy kod (żeby mieć kanały i migracje)
```powershell
git pull --ff-only
```
Jeśli pull się nie uda (lokalne zmiany / rozjazd) — zatrzymaj się, pokaż użytkownikowi
`git status` i rozwiąż konflikt zanim ruszysz dalej. Kanały to commity `feat(channels)`
+ migracje `0077_perfect_blindfold.sql` i `0078_abandoned_spyke.sql`. Bez pulla nowa
maszyna ich nie ma — to była przyczyna „nie było kanałów".

### 2. Zainstaluj zależności, jeśli trzeba
```powershell
if (-not (Test-Path node_modules)) { pnpm install }
```
Jeśli `git pull` zmienił `pnpm-lock.yaml`, też uruchom `pnpm install`.

### 3. Jeśli już działa — nie startuj drugi raz
```powershell
try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/health -TimeoutSec 3).StatusCode } catch { 0 }
```
Jeśli zwróci `200` — aplikacja już stoi, przejdź do kroku 6 (weryfikacja).

### 4. Pre-empt: ubij zalegający embedded Postgres (znany cichy hang)
`pnpm dev` potrafi **zawisnąć cicho** zaraz po logu
`[paperclip] dev mode: local_trusted (default)` — brak dalszego outputu, port 3100
nie wstaje, procesy node mają zerowe CPU. Przyczyna: orphan `postgres.exe` z poprzedniego
runu trzyma shared memory (`FATAL: pre-existing shared memory block is still in use`).
Profilaktycznie ubij zalegające procesy embedded Postgresa:
```powershell
Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" |
  Where-Object { $_.CommandLine -like '*embedded-postgres*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```
Diagnostyka (gdy chcesz zobaczyć realny błąd PG zamiast wiszącego runnera):
`pnpm --filter @paperclipai/db exec tsx src/migration-status.ts --json`

### 5. Wystartuj dev w tle
Uruchom `pnpm dev` jako proces w tle (migracje `0077`/`0078` zaaplikują się
automatycznie). Loguj do pliku, np. `tmp/dev-run.log`. Potem odpytuj health aż `200`:
```powershell
1..40 | ForEach-Object {
  try { if ((Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3100/api/health -TimeoutSec 3).StatusCode -eq 200) { 'READY'; break } } catch {}
  Start-Sleep 3
}
```
Po sprzątnięciu Postgresa serwer wstaje w ~6 s.

### 6. Zweryfikuj, że KANAŁY działają (nie tylko health)
```powershell
$cid = (Invoke-RestMethod http://127.0.0.1:3100/api/companies)[0].id
(Invoke-RestMethod "http://127.0.0.1:3100/api/companies/$cid/channels").Count
```
Oczekiwane: liczba kanałów ≥ 1 (kanały generują się z hierarchii firmy — menedżer
+ poddrzewo `reportsTo`). Jeśli `0` kanałów mimo że firma ma agentów-menedżerów —
to regresja, zdiagnozuj. Health 200 + ≥1 kanał = sukces, zgłoś gotowość użytkownikowi.

## Ważne: dane są per-maszyna
Kod i schemat kanałów jadą przez git. **Dane firm/agentów NIE** — siedzą w lokalnym
embedded Postgresie (`~/.paperclip`), który nie jest w repo. Jeśli nowa maszyna ma
pustą/inną bazę, kanałów nie będzie dopóki nie istnieje firma z agentami-menedżerami.
Wtedy najpierw utwórz firmę (skill `company-creator`), a kanały pojawią się same.
