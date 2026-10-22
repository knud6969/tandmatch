# Arbejdsplan: status og det, der er tilbage

Forkortet 2026-10-22 efter omlægningen til `features/`. Den fulde plan for trin 0-8 (opgaver, filer og "færdig når") findes i git-historikken: `git log -p -- docs/arbejdsplan.md`. Arkitekturen står i `docs/architecture.md` og domænernes README.

## Status

| Trin | Indhold | Status |
|---|---|---|
| 0-6 | Database, katalog, klinikprofil, oversigt, AI-chat, leads, indbakke, booking og anmeldelser | Færdigt |
| 7 | Akutvej, postnumre, 50 km, demodata, samtykkeversioner (7.1-7.12b, 7.15, 7.16) | Færdigt |
| 8 | Patient-appen i `mobile/`: login og konto, forside, klinikoversigt og profil, AI-chat som samtale med svar-kort og hurtigsvar, vælg og send til op til 3 klinikker (8.1-8.6i, 8.8a, 8.11e) | Delvist |
| Oprydning | Patientsiderne på weben fjernet; koden flyttet fra lag til `features/<domæne>/` med grænser i lint (`docs/oprydning-features.md`) | Færdigt 2026-10-22 |

## Tilbage i appen (trin 8)

| # | Opgave | Prioritet |
|---|---|---|
| 8.7 | Billeder i chatten med samtykkekort og upload (AI'en ser billederne ved næste tur) | Høj |
| 8.8b | Mine sager og sagsskærmen (status pr. lead) | Høj |
| 8.9 | Booking, bookinger og anmeldelse | Høj |
| 8.10 | Akutvejen i appen | Mellem |
| 8.5 | Kort i oversigten (`react-native-maps`) | Mellem |
| 8.11a-d | Beskeder, træk tilbage/luk sag/aflys, samtykker og slet konto, tandlæger og portefølje | Lav |
| 8.11f | Akut-blokken én gang pr. samtale (akut-henvisning i chatten er slået fra, se `features/cases/README.md` 7.9 og `docs/security.md` kompromis 29) | Lav |
| 8.12-8.13 | Slutkontrol (reviewer, security, tester; inkl. 7.12d) og rettelser | Før aflevering af eksamensprojektet |
| 8.14 | README med opstart af web og app | Delvist (brugerens README) |

## Kendte problemer

- Chatten i appen virker, men flowet er ikke 100 % (svar-kort og afgrænsning skal finjusteres efter brugertest).
- IP-rate limit deler én pulje lokalt, når `x-forwarded-for` mangler (fx 10 nye chats eller konti pr. time i alt).
- 7.12c: `scripts/generate-postal-codes.ts` skriver direkte i den kørte migration `20261028000400`; output-filnavnet bør være et argument.

## Før en demo mod det fælles projekt

1. `supabase db push` for migrationerne `20261027000100`-`20261028000500` (ikke kørt i det fælles projekt endnu).
2. `npm run dev -- -H 0.0.0.0` i roden, og `npx expo start` i `mobile/` (se `README.md`).
3. Evt. demodata: `npm run seed:demo` (lokalt) eller seed-scriptet med `--allow-remote` (det fælles projekt).
