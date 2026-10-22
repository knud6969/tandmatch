# Arbejdsplan: status og det, der er tilbage

Forkortet 2026-10-22 efter omlægningen til `features/`. Den fulde plan for trin 0-8 (opgaver, filer og "færdig når") findes i git-historikken: `git log -p -- docs/arbejdsplan.md`. Arkitekturen står i `docs/architecture.md` og domænernes README.

## Status

| Trin | Indhold | Status |
|---|---|---|
| 0-6 | Database, katalog, klinikprofil, oversigt, AI-chat, leads, indbakke, booking og anmeldelser | Færdigt |
| 7 | Akutvej, postnumre, 50 km, demodata, samtykkeversioner (7.1-7.12b, 7.15, 7.16) | Færdigt |
| 8 | Patient-appen i `mobile/`: login og konto, forside, klinikoversigt og profil, AI-chat som samtale med svar-kort og hurtigsvar, vælg og send til op til 3 klinikker (8.1-8.6i, 8.8a, 8.11e) | Delvist |
| Oprydning | Patientsiderne på weben fjernet; koden flyttet fra lag til `features/<domæne>/` med grænser i lint (`docs/oprydning-features.md`) | Færdigt 2026-10-22 |
| 9 | Appen klar til aflevering: forside, chat der altid fører videre, "klinikker der kan hjælpe", demoprofiler | Planlagt (nedenfor) |
| 10 | Klinik-web og app spiller sammen: Mine sager, booking, beskeder, akut i appen; egne behandlinger | Planlagt, efter afleveringen |

## Tilbage i appen (trin 8)

Resten af trin 8 er fordelt: 8.12-8.13 er trin 9.12-9.15; 8.8b, 8.9, 8.10 og 8.11a-b er trin 10.1-10.6. 8.7 (billeder i chatten), 8.5 (kort) og 8.11c-d, f står her og tages, hvis der er tid.

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

## Trin 9: Appen klar til aflevering

Branch `feat/app-klar`. Brugerens ønsker 2026-10-22 i prioriteret rækkefølge: (1) forside, (2) chat der altid fører videre, (3) "Se klinikker der kan hjælpe" viser klinikker, der tilbyder behandlingerne, (4) demoprofiler. Kontrakterne står i `features/cases/README.md` 7.9a, `features/clinics/README.md` 4.3 og 6.6, `mobile/README.md` 13.4a, 13.8 og 13.9. Hver opgave er én commit. Efter hver opgave: `npx tsc --noEmit`, `npm run lint` og de berørte tests (i `mobile/`: `npx tsc --noEmit`, `npx eslint .`, `npm test`).

**Spor, der kan køre parallelt** (forskellige domæner og filer):
- **Spor A, sager og AI** (`lib/cases`, `features/cases`): 9.1 → 9.2 → 9.3 → 9.4 → 9.5. Rækkefølgen er fast, fordi 9.3 og 9.4 rører de samme filer i `features/cases/ai/`, og 9.5 tester det hele.
- **Spor B, klinikker og demodata** (`lib/clinics`, `features/clinics`, `supabase/`, `scripts/`): 9.8 og 9.10 kan køre samtidig; 9.11 efter 9.10 (eller uden 9.10, hvis 12.3 punkt 45 ikke godkendes).
- **Spor C, appens udseende** (`mobile/`): 9.7 og 9.6b kan starte med det samme. 9.6a efter 9.1; 9.9 efter 9.8. 9.6a og 9.6b rører begge `chat-panel.tsx` og tages derfor efter hinanden.
- Afslutning: 9.12 → 9.13 → 9.14 → 9.15, når A, B og C er færdige.

| # | Agent | Opgave | Filer | Færdig når | Efter |
|---|---|---|---|---|---|
| 9.1 | backend | Behandlingskortet vises også ved forslag eller efter 6 patientbeskeder (7.9a regel 1) | `lib/cases/domain/case-flow.ts`, `lib/cases/constants/case-flow.ts` (`SERVICE_CARD_AFTER_USER_MESSAGES = 6`), `features/cases/__tests__/caseFlow.test.ts` | Tests dækker: forslag uden `readyForSummary` → `services`; 5 beskeder uden forslag → `chat`; 6 → `services`; bekræftede ydelser går forud; alle eksisterende tests består | – |
| 9.2 | backend | `ChatStateDto.readyForSummary` klæbende (7.9a regel 2) | `features/cases/chatController.ts` (`getState`), `features/cases/__tests__/api/chat.test.ts` | API-test: tur med forslag, derefter en tur uden → `GET /chat` giver stadig `readyForSummary: true` | 9.1 |
| 9.3 | ai-flow | Forslag går ikke tabt, når teksten blokeres (7.9a regel 3) | `features/cases/ai/guard.ts`, `lib/cases/constants/ai-texts.ts` (`SUGGESTION_FALLBACK_TEXT`), `features/cases/__tests__/ai/guardrails.test.ts` | Tests: pris i `reply` i begge forsøg med gyldige forslag → fast tekst, forslagene, `readyForSummary: true`, `blocked: true`, ingen vurdering; ukendt slug → som i dag `CHAT_BLOCKED_TEXT`; akut med `emergencyReferralInChat: true` uændret; alle provokationstests består | 9.2 |
| 9.4 | ai-flow | Prompt `chat.v5.ts` og `rules-v5` (7.9a regel 4); `chat.v4.ts` slettes | `features/cases/ai/prompts/chat.v5.ts`, `features/cases/ai/rules.ts`, `features/cases/ai/guard.ts` (import af `CHAT_RETRY_REMINDER`), `features/cases/ai/aiChatService.ts`, `features/cases/__tests__/ai/guardrails.test.ts` | Prompttests finder "højst tre", forbuddet mod klinikker og bekræftelse i forslagsturen og gentagelse af forslag; versionerne er hævet; `AI_LIVE=1`-kørslen (manuel, før demo) giver forslag senest i fjerde tur for "jeg har ondt i en tand", "jeg vil have hvidere tænder" og "mine tænder er skæve" | 9.3 |
| 9.5 | tester | Falsk klient som en rigtig samtale og rejse-testen (7.9a regel 6 og 7) | `features/cases/ai/fakeAiClient.ts`, `features/cases/__tests__/api/case-flow-journey.test.ts` | Rejse-testen består med `AI_FAKE_CLIENT=1` via `tests/api/run.sh`; alle eksisterende API- og e2e-tests består uændret | 9.4 (og 9.8 for den sidste del; ellers springes `onlyOffering`-kaldet over med en `TODO 9.8`, som fjernes i 9.8) |
| 9.6a | frontend | Appens chatlogik: klæbende `ready`, hurtigsvar også med åbent kort (7.9a regel 2 og 5), `flowStepForApp` får `suggestedServices` | `mobile/src/hooks/use-chat.ts`, `mobile/src/utils/case-cards.ts`, `mobile/src/screens/case-flow-screen.tsx`, `mobile/tests/case-cards.test.ts`, `mobile/tests/quick-replies.test.ts` | Jest: forslag uden flag → kortet; ny tur uden flag efter forslag → kortet bliver; hurtigsvar vises med åbent kort | 9.1 |
| 9.6b | frontend | Chatten professionel og minimalistisk (13.9): header med fremdriftslinje, én grænselinje, én PII-hjælpetekst, nye bobler, pills, kort og inputfelt | `mobile/src/components/chat/{chat-panel,chat-bubble}.tsx`, `mobile/src/components/case/*-card.tsx`, `mobile/src/components/case/flow-card.tsx`, evt. ny `mobile/src/components/case/flow-progress.tsx`, `mobile/src/screens/case-flow-screen.tsx` | Skærmbilleder på iPhone 16 og SE i PR'en; mærkatet for foreløbig vurdering og `AI_BOUNDARY_TEXT` står stadig; ingen nye farver uden for `theme.ts`; tests består | – (før eller efter 9.6a, ikke samtidig) |
| 9.7 | frontend | Forsiden professionel og minimalistisk (13.9) | `mobile/src/screens/home-screen.tsx`, `mobile/src/components/clinic-directory/home-entries.tsx`, `mobile/src/components/auth/anonymous-banner.tsx` | Én primær knap, to rækker, tre korte trin, 112-teksten står; skærmbilleder på iPhone 16 og SE; tests består | – |
| 9.8 | backend | Filteret `onlyOffering` (6.6, 10.7) | `lib/clinics/schemas/clinics.ts`, `features/clinics/rankingService.ts` (`RankingFilters`, `filter`, `criteria`), `features/clinics/clinicDirectoryController.ts`, `features/clinics/__tests__/rankingService.test.ts`, `features/clinics/__tests__/api/directory.test.ts` | Unit: klinik uden pris på én behandling og basisklinik falder fra; kriterielinjen vises. API: `onlyOffering=true` uden `services` → 400; med → kun klinikker med pris på alle. Weben er uændret | – |
| 9.9 | frontend | "Se klinikker der kan hjælpe" i appen (13.4a) | `mobile/src/utils/clinic-filters.ts` (`onlyOffering` i `DirectoryFilters` og `buildClinicsQuery`), `mobile/src/screens/clinic-directory-screen.tsx`, `mobile/src/components/clinic-directory/*` (filtre, `SelectButton`, tom liste), `mobile/src/screens/clinic-profile-screen.tsx`, `mobile/tests/clinic-filters.test.ts` | Med sagen `fast_bojle` ses kun v0 (efter 9.11); "Vis også andre klinikker i området" viser resten; "Vælg klinik" er deaktiveret med forklaring for klinikker uden pris; Jest for query-byggeren | 9.8 |
| 9.10 | backend | (udgår, brugerens beslutning 2026-10-22) Fem nye standardbehandlinger (4.3) | `supabase/migrations/20261029000100_catalog_additions.sql`, `features/clinics/__tests__/api/clinics.test.ts` (katalogets antal og de nye slugs) | `supabase db reset` lokalt består; `GET /api/services` har de fem i de rigtige kategorier; typen `emergency` kun i `akut` (triggeren består) | Brugerens godkendelse (12.3 punkt 45) |
| 9.11 | backend | Demoklinikker med forskellige profiler (13.8) | `scripts/seed-demo.ts` (basisprisliste, `offers` pr. klinik, kategorier udledt, leadregler, forhistorik), `features/clinics/__tests__/api/demo-data.test.ts` | `npm run seed:demo` lokalt består og stopper med fejl, hvis et lead går til en klinik uden pris; `demo-data.test.ts` består (akutfilteret fra 2100 er stadig ikke tomt) og har nye tests for søgningerne i 13.8 (fx `fast_bojle` med `onlyOffering` fra 2100 giver kun v0, når 9.8 er bygget) | 9.10 (eller uden de nye slugs) |
| 9.12 | reviewer | Gennemgang af 9.1-9.11 mod 2.1, 7.9a, 6.6 og 13.4a/13.9 | – | Fund rapporteret med fil og forslag | A, B og C |
| 9.13 | security | AI-reglerne (9.3, 9.4: fast tekst ved blokering, ny prompt), filteret (9.8) og seedet | – | Ingen nye priser eller klinikanbefalinger i AI-svar; `blocked`-svar indeholder aldrig modellens tekst; kompromis 29 (akut slået fra) er uændret | 9.12 |
| 9.14 | tester | Alle suiter og manuel tjekliste på iPhone (13.7): almindelig samtale → kort → klinikker der kan hjælpe → send; forside; tomme resultater | – | `test:rls`, `test:api`, `test:unit`, `tests/ai`, `test:e2e`, appens Jest grønne; tjeklisten gennemgået på iPhone 16 og SE | 9.13 |
| 9.15 | backend/frontend | Rettelser fra 9.12-9.14 | efter fund | Fundene lukket eller flyttet til trin 10 med begrundelse | 9.14 |

## Trin 10: Klinik-web og app spiller sammen (efter afleveringen)

Målet er, at hele rejsen virker på tværs: patienten sender fra appen, klinikken svarer på weben, patienten ser svaret, booker og skriver i appen, klinikken ser bookingen og kontaktoplysningerne, og patienten anmelder bagefter. API'erne findes allerede (10.5, 10.9-10.13); det, der mangler, er især appens skærme. **Bemærk:** demoforløbet i `mobile/README.md` 13.8 (patient booker i appen) virker først med 10.1 og 10.2. Skal det vises ved afleveringen, flyttes 10.1 og 10.2 frem efter 9.11.

Hvad der mangler i dag:
- **Appen:** Mine sager er en pladsholder (`mobile/src/screens/cases-screen.tsx`); der er ingen sagsskærm med status pr. lead, klinikkens kommentar og pris, ingen booking, bookinger, anmeldelse, beskeder, træk tilbage, luk sag, aflys eller akutvej (13.4).
- **Klinik-weben:** henvendelser og bookinger fra appen ses kun ved genindlæsning; indbakken viser ikke antal ubesvarede.
- **Tværs:** ingen test, der kører patient i appen (API) og klinik på weben i samme forløb; leads til klinikker uden pris på behandlingerne afvises ikke af serveren (12.3 punkt 44).
- **Katalog:** ingen egne behandlinger pr. klinik og ingen adminside til kataloget.

| # | Agent | Opgave | Filer | Færdig når | Efter |
|---|---|---|---|---|---|
| 10.1 | frontend | (før afleveringen, efter 9.11) Mine sager og sagsskærmen (tidl. 8.8b): liste med status og næste booking; sagen med leads, status, klinikkens kommentar, præciseret pris og listepris | `mobile/src/screens/cases-screen.tsx`, ny `mobile/src/screens/case-screen.tsx`, `mobile/app/sag/[caseId]/index.tsx`, `mobile/src/api/cases.ts`, `mobile/src/components/case/lead-row.tsx` | Accept på klinik-weben ses i appen ved fokus; Jest for hjælpere | – |
| 10.2 | frontend | (før afleveringen, efter 10.1) Book tid og bookinger (tidl. 8.9 del 1): vælg behandling og ledig tid, navn og telefon, book; liste over bookinger | ny `mobile/src/screens/{book,bookings}-screen.tsx`, `mobile/app/sag/[caseId]/book/[leadId].tsx`, `mobile/app/bookinger.tsx`, `mobile/src/api/bookings.ts` | Bookingen ses i klinikkens kalender med navn og telefon; `SLOT_TAKEN` henter tiderne igen | 10.1 |
| 10.3 | frontend | Anmeldelse fra en gennemført booking (tidl. 8.9 del 2) | ny `mobile/src/screens/review-screen.tsx`, `mobile/app/anmeld/[bookingId].tsx`, `mobile/src/api/reviews.ts` | Anmeldelsen ses på klinik-weben efter moderation; prisnøjagtighed opdateres | 10.2 |
| 10.4 | frontend | Beskeder pr. lead (tidl. 8.11a), polling hvert 15. sekund | ny `mobile/src/screens/messages-screen.tsx`, `mobile/app/sag/[caseId]/beskeder/[leadId].tsx`, `mobile/src/api/messages.ts` | Besked fra klinik-weben ses i appen og omvendt; `MESSAGE_LIMIT` vises på dansk | 10.1 |
| 10.5 | frontend | Træk tilbage, luk sag og aflys booking (tidl. 8.11b) | `mobile/src/screens/case-screen.tsx`, `mobile/src/screens/bookings-screen.tsx` | Klinikken ser "Trukket tilbage" og aflysningen; `CLOSE_CASE_CONSEQUENCE` vises | 10.2 |
| 10.6 | frontend | Akutvejen i appen (tidl. 8.10) | ny `mobile/src/screens/emergency-screen.tsx`, `mobile/app/akut.tsx`, `mobile/src/api/emergency.ts` | Akut-lead med reserveret tid ses øverst i klinikkens indbakke og som reservation i kalenderen | – |
| 10.7 | frontend | Klinik-weben opdaterer indbakke og kalender selv og viser antal ubesvarede (clinics 6.3) | `features/leads/components/*` (indbakken), `features/booking/components/*` (kalenderen), `platform/ui-utils/` (en delt `usePolling`, hvis den ikke findes) | Lead sendt fra appen ses på `/klinik` inden for 30 sekunder uden genindlæsning; ingen polling, når fanen er skjult | – |
| 10.8 | tester | Tværgående rejse: patient som appen (bearer via API) og klinik i Playwright på weben: send → accepter med kommentar → book → klinikken ser kontakt → gennemført → anmeld | `tests/e2e/cross-journey.spec.ts`, evt. hjælper i `tests/api/` | Testen består med `AI_FAKE_CLIENT=1`; isolation: en anden klinik ser intet | 10.1-10.3 |
| 10.9 | architect | Beslut egne behandlinger (12.3 punkt 47) og skriv kontrakten i `features/clinics/README.md` 4.3 | `features/clinics/README.md`, `docs/beslutninger.md` | Valgt A eller B; migration, RLS, API og UI beskrevet | Brugerens beslutning |
| 10.10 | backend → frontend → security → tester | Byg egne behandlinger efter 10.9, delt i commits: migration og RLS-test; repository og API; prisliste-UI på klinik-weben; visning på profilen i appen | efter 10.9 | efter 10.9 | 10.9 |
| 10.11 | backend | `SERVICE_NOT_OFFERED` i `send_leads()`, hvis 12.3 punkt 44 besluttes | ny migration, `lib/common/domain/errors.ts`, `features/leads/__tests__/api/` | Lead til klinik uden pris på alle sagens behandlinger giver 409; RLS- og API-tests | Brugerens beslutning |
| 10.12 | frontend | Én fælles query-bygger for klinikoversigten i `lib/clinics/domain/clinic-query.ts` (afvigelsen under Kendte problemer) | `lib/clinics/domain/clinic-query.ts`, `features/clinics/utils/clinic-query.ts`, `mobile/src/utils/clinic-filters.ts` og tests | Web og app bygger forespørgslen med samme funktion; lint og tests består | – |
| 10.13 | – | Push-notifikationer, adminside til kataloget, hosting | – | [UDSKUDT] (`docs/beslutninger.md` 12.4 punkt 5, 14, 15, 16) | – |

10.1-10.6 er alle i `mobile/` og rører hver sin skærm, så 10.4 og 10.6 kan køre parallelt med 10.2; 10.7 (web) kan køre parallelt med alle app-opgaverne.

## Kendte problemer

- Chatten i appen fører ikke altid videre til svar-kortene. Årsagerne står i `features/cases/README.md` 7.9a og rettes i trin 9.1-9.6.
- `?services=` filtrerer ikke klinikoversigten; den sorterer kun. Rettes med `onlyOffering` i 9.8-9.9.
- Alle verificerede demoklinikker har samme prisliste (`PRICE_BASE`), så filteret kan ikke ses virke. Rettes i 9.11.
- Afvigelse fra 2.1/13.6: forespørgslen til `/api/clinics` bygges to steder (`features/clinics/utils/clinic-query.ts` og `mobile/src/utils/clinic-filters.ts`). Forslag: flyt den fælles rene del (`DirectoryFilters` uden webens ekstra felter → query-nøgler) til `lib/clinics/domain/clinic-query.ts` efter afleveringen (10.12). Indtil da tilføjes `onlyOffering` kun i appens udgave (9.9); weben sender det ikke.
- IP-rate limit deler én pulje lokalt, når `x-forwarded-for` mangler (fx 10 nye chats eller konti pr. time i alt).
- 7.12c: `scripts/generate-postal-codes.ts` skriver direkte i den kørte migration `20261028000400`; output-filnavnet bør være et argument.

## Før en demo mod det fælles projekt

1. `supabase db push` for migrationerne `20261027000100`-`20261028000500` (ikke kørt i det fælles projekt endnu).
2. `npm run dev -- -H 0.0.0.0` i roden, og `npx expo start` i `mobile/` (se `README.md`).
3. Evt. demodata: `npm run seed:demo` (lokalt) eller seed-scriptet med `--allow-remote` (det fælles projekt).
