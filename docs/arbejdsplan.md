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
| 11 | Notifikationer (PR A), flyt tid, kalender og favoritter (PR B), klinikkens statistik og admin (PR C) | Planlagt 2026-11-04 (nedenfor). PR A: server, database og `lib/` bygget (11.1-11.6, inkl. web push til klinik-weben); 11.7 bygget (web); 11.8 bygget i koden, men `expo-notifications` skal installeres (`npx expo install expo-notifications`) |

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
| 9.1 (bygget) | backend | Behandlingskortet vises også ved forslag eller efter 6 patientbeskeder (7.9a regel 1) | `lib/cases/domain/case-flow.ts`, `lib/cases/constants/case-flow.ts` (`SERVICE_CARD_AFTER_USER_MESSAGES = 6`), `features/cases/__tests__/caseFlow.test.ts` | Tests dækker: forslag uden `readyForSummary` → `services`; 5 beskeder uden forslag → `chat`; 6 → `services`; bekræftede ydelser går forud; alle eksisterende tests består | – |
| 9.2 (bygget) | backend | `ChatStateDto.readyForSummary` klæbende (7.9a regel 2) | `features/cases/chatController.ts` (`getState`), `features/cases/__tests__/api/chat.test.ts` | API-test: tur med forslag, derefter en tur uden → `GET /chat` giver stadig `readyForSummary: true` | 9.1 |
| 9.3 (bygget) | ai-flow | Forslag går ikke tabt, når teksten blokeres (7.9a regel 3) | `features/cases/ai/guard.ts`, `lib/cases/constants/ai-texts.ts` (`SUGGESTION_FALLBACK_TEXT`), `features/cases/__tests__/ai/guardrails.test.ts` | Tests: pris i `reply` i begge forsøg med gyldige forslag → fast tekst, forslagene, `readyForSummary: true`, `blocked: true`, ingen vurdering; ukendt slug → som i dag `CHAT_BLOCKED_TEXT`; akut med `emergencyReferralInChat: true` uændret; alle provokationstests består | 9.2 |
| 9.4 (bygget) | ai-flow | Prompt `chat.v5.ts` og `rules-v5` (7.9a regel 4); `chat.v4.ts` slettes | `features/cases/ai/prompts/chat.v5.ts`, `features/cases/ai/rules.ts`, `features/cases/ai/guard.ts` (import af `CHAT_RETRY_REMINDER`), `features/cases/ai/aiChatService.ts`, `features/cases/__tests__/ai/guardrails.test.ts` | Prompttests finder "højst tre", forbuddet mod klinikker og bekræftelse i forslagsturen og gentagelse af forslag; versionerne er hævet; `AI_LIVE=1`-kørslen (manuel, før demo) giver forslag senest i fjerde tur for "jeg har ondt i en tand", "jeg vil have hvidere tænder" og "mine tænder er skæve" | 9.3 |
| 9.5 (bygget) | tester | Falsk klient som en rigtig samtale og rejse-testen (7.9a regel 6 og 7) | `features/cases/ai/fakeAiClient.ts`, `features/cases/__tests__/api/case-flow-journey.test.ts` | Rejse-testen består med `AI_FAKE_CLIENT=1` via `tests/api/run.sh`; alle eksisterende API- og e2e-tests består uændret | 9.4 (og 9.8 for den sidste del; ellers springes `onlyOffering`-kaldet over med en `TODO 9.8`, som fjernes i 9.8) |
| 9.6a (bygget) | frontend | Appens chatlogik: klæbende `ready`, hurtigsvar også med åbent kort (7.9a regel 2 og 5), `flowStepForApp` får `suggestedServices` | `mobile/src/hooks/use-chat.ts`, `mobile/src/utils/case-cards.ts`, `mobile/src/screens/case-flow-screen.tsx`, `mobile/tests/case-cards.test.ts`, `mobile/tests/quick-replies.test.ts` | Jest: forslag uden flag → kortet; ny tur uden flag efter forslag → kortet bliver; hurtigsvar vises med åbent kort | 9.1 |
| 9.6b | frontend | Chatten professionel og minimalistisk (13.9) (bygget): header med fremdriftslinje, én grænselinje, én PII-hjælpetekst, nye bobler, pills, kort og inputfelt | `mobile/src/components/chat/{chat-panel,chat-bubble}.tsx`, `mobile/src/components/case/*-card.tsx`, `mobile/src/components/case/flow-card.tsx`, evt. ny `mobile/src/components/case/flow-progress.tsx`, `mobile/src/screens/case-flow-screen.tsx` | Skærmbilleder på iPhone 16 og SE i PR'en; mærkatet for foreløbig vurdering og `AI_BOUNDARY_TEXT` står stadig; ingen nye farver uden for `theme.ts`; tests består | – (før eller efter 9.6a, ikke samtidig) |
| 9.7 | frontend | Forsiden professionel og minimalistisk (13.9) (bygget) | `mobile/src/screens/home-screen.tsx`, `mobile/src/components/clinic-directory/home-entries.tsx`, `mobile/src/components/auth/anonymous-banner.tsx` | Én primær knap, to rækker, tre korte trin, 112-teksten står; skærmbilleder på iPhone 16 og SE; tests består | – |
| 9.8 (bygget) | backend | Filteret `onlyOffering` (6.6, 10.7) | `lib/clinics/schemas/clinics.ts`, `features/clinics/rankingService.ts` (`RankingFilters`, `filter`, `criteria`), `features/clinics/clinicDirectoryController.ts`, `features/clinics/__tests__/rankingService.test.ts`, `features/clinics/__tests__/api/directory.test.ts` | Unit: klinik uden pris på én behandling og basisklinik falder fra; kriterielinjen vises. API: `onlyOffering=true` uden `services` → 400; med → kun klinikker med pris på alle. Weben er uændret | – |
| 9.9 (bygget) | frontend | "Se klinikker der kan hjælpe" i appen (13.4a) | `mobile/src/utils/clinic-filters.ts` (`onlyOffering` i `DirectoryFilters` og `buildClinicsQuery`), `mobile/src/screens/clinic-directory-screen.tsx`, `mobile/src/components/clinic-directory/*` (filtre, `SelectButton`, tom liste), `mobile/src/screens/clinic-profile-screen.tsx`, `mobile/tests/clinic-filters.test.ts` | Med sagen `fast_bojle` ses v0 og v7 (efter bred demodækning, 9.11); "Vis også andre klinikker i området" viser resten; "Vælg klinik" er deaktiveret med forklaring for klinikker uden pris; Jest for query-byggeren | 9.8 |
| 9.10 | backend | (udgår, brugerens beslutning 2026-10-22) Fem nye standardbehandlinger (4.3) | `supabase/migrations/20261029000100_catalog_additions.sql`, `features/clinics/__tests__/api/clinics.test.ts` (katalogets antal og de nye slugs) | `supabase db reset` lokalt består; `GET /api/services` har de fem i de rigtige kategorier; typen `emergency` kun i `akut` (triggeren består) | Brugerens godkendelse (12.3 punkt 45) |
| 9.11 (bygget) | backend | Demoklinikker med forskellige profiler (13.8) | `scripts/seed-demo.ts` (basisprisliste, `offers` pr. klinik, kategorier udledt, leadregler, forhistorik), `features/clinics/__tests__/api/demo-data.test.ts` | `npm run seed:demo` lokalt består og stopper med fejl, hvis et lead går til en klinik uden pris; `demo-data.test.ts` består (akutfilteret fra 2100 er stadig ikke tomt) og har nye tests for søgningerne i 13.8 (fx `fast_bojle` med `onlyOffering` fra 2100 giver kun v0, når 9.8 er bygget) | 9.10 (eller uden de nye slugs) |
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
| 10.1 (bygget) | frontend | (før afleveringen, efter 9.11) Mine sager og sagsskærmen (tidl. 8.8b): liste med status og næste booking; sagen med leads, status, klinikkens kommentar, præciseret pris og listepris | `mobile/src/screens/cases-screen.tsx`, ny `mobile/src/screens/case-screen.tsx`, `mobile/app/sag/[caseId]/index.tsx`, `mobile/src/api/cases.ts`, `mobile/src/components/case/lead-row.tsx` | Accept på klinik-weben ses i appen ved fokus; Jest for hjælpere | – |
| 10.2 (bygget) | frontend | (før afleveringen, efter 10.1) Book tid og bookinger (tidl. 8.9 del 1): vælg behandling og ledig tid, navn og telefon, book; liste over bookinger | ny `mobile/src/screens/{book,bookings}-screen.tsx`, `mobile/app/sag/[caseId]/book/[leadId].tsx`, `mobile/app/bookinger.tsx`, `mobile/src/api/bookings.ts` | Bookingen ses i klinikkens kalender med navn og telefon; `SLOT_TAKEN` henter tiderne igen | 10.1 |
| 10.3 (bygget) | frontend | Anmeldelse fra en gennemført booking (tidl. 8.9 del 2) | ny `mobile/src/screens/review-screen.tsx`, `mobile/app/anmeld/[bookingId].tsx`, `mobile/src/api/reviews.ts` | Anmeldelsen ses på klinik-weben efter moderation; prisnøjagtighed opdateres | 10.2 |
| 10.4 (bygget) | frontend | Beskeder pr. lead (tidl. 8.11a), polling hvert 15. sekund | ny `mobile/src/screens/messages-screen.tsx`, `mobile/app/sag/[caseId]/beskeder/[leadId].tsx`, `mobile/src/api/messages.ts` | Besked fra klinik-weben ses i appen og omvendt; `MESSAGE_LIMIT` vises på dansk | 10.1 |
| 10.5 (bygget) | frontend | Træk tilbage, luk sag og aflys booking (tidl. 8.11b) | `mobile/src/screens/case-screen.tsx`, `mobile/src/screens/bookings-screen.tsx` | Klinikken ser "Trukket tilbage" og aflysningen; `CLOSE_CASE_CONSEQUENCE` vises | 10.2 |
| 10.6 (bygget) | frontend | Akutvejen i appen (tidl. 8.10) | ny `mobile/src/screens/emergency-screen.tsx`, `mobile/app/akut.tsx`, `mobile/src/api/emergency.ts` | Akut-lead med reserveret tid ses øverst i klinikkens indbakke og som reservation i kalenderen | – |
| 10.7 (bygget) | frontend | Klinik-weben opdaterer indbakke og kalender selv og viser antal ubesvarede (clinics 6.3) | `features/leads/components/*` (indbakken), `features/booking/components/*` (kalenderen), `platform/ui-utils/` (en delt `usePolling`, hvis den ikke findes) | Lead sendt fra appen ses på `/klinik` inden for 30 sekunder uden genindlæsning; ingen polling, når fanen er skjult | – |
| 10.8 (bygget) | tester | Tværgående rejse: patient som appen (bearer via API) og klinik i Playwright på weben: send → accepter med kommentar → book → klinikken ser kontakt → gennemført → anmeld | `tests/e2e/cross-journey.spec.ts`, evt. hjælper i `tests/api/` | Testen består med `AI_FAKE_CLIENT=1`; isolation: en anden klinik ser intet | 10.1-10.3 |
| 10.9 [UDSKUDT] | architect | Beslut egne behandlinger (12.3 punkt 47) og skriv kontrakten i `features/clinics/README.md` 4.3 | `features/clinics/README.md`, `docs/beslutninger.md` | Valgt A eller B; migration, RLS, API og UI beskrevet. Brugeren besluttede 2026-10-24 at vente; kun standardkataloget bruges indtil videre | Brugerens beslutning |
| 10.10 [UDSKUDT] | backend → frontend → security → tester | Byg egne behandlinger efter 10.9, delt i commits: migration og RLS-test; repository og API; prisliste-UI på klinik-weben; visning på profilen i appen | efter 10.9 | efter 10.9 | 10.9 |
| 10.11 | backend | `SERVICE_NOT_OFFERED` i `send_leads()`, hvis 12.3 punkt 44 besluttes | ny migration, `lib/common/domain/errors.ts`, `features/leads/__tests__/api/` | Lead til klinik uden pris på alle sagens behandlinger giver 409; RLS- og API-tests | Brugerens beslutning |
| 10.12 (bygget) | frontend | Én fælles query-bygger for klinikoversigten i `lib/clinics/domain/clinic-query.ts` (afvigelsen under Kendte problemer) | `lib/clinics/domain/clinic-query.ts`, `features/clinics/utils/clinic-query.ts`, `mobile/src/utils/clinic-filters.ts` og tests | Web og app bygger forespørgslen med samme funktion; lint og tests består | – |
| 10.13 | – | Push-notifikationer, adminside til kataloget, hosting | – | [UDSKUDT] (`docs/beslutninger.md` 12.4 punkt 5, 14, 15, 16). Push og en adminside til klinikstatus og moderation er flyttet til trin 11; katalog-admin og hosting er stadig udskudt | – |

10.1-10.6 er alle i `mobile/` og rører hver sin skærm, så 10.4 og 10.6 kan køre parallelt med 10.2; 10.7 (web) kan køre parallelt med alle app-opgaverne.

## Trin 11: Notifikationer, booking, favoritter, statistik og admin

**Planlagt (2026-11-04).** Tre PR'er i rækkefølge, hver på sin branch fra `main`. Kontrakterne står i `platform/README.md` 14 (notifikationer), `features/identity/README.md` 4.3 og 10.15, `features/clinics/README.md` 4.3, 6.3 og 10.17-10.19, `features/booking/README.md` 4.3 og 10.16, `features/leads/README.md` 10.9 og 10.12, `features/admin/README.md`, `features/site/README.md` 6.1 og `mobile/README.md` 13.10-13.12. Åbne spørgsmål: `docs/beslutninger.md` 12.3 punkt 48-57 (architects forslag gælder, til brugeren siger andet).

Fælles for alle opgaver: én opgave = én commit. Efter hver opgave består `npx tsc --noEmit`, `npm run lint` og de berørte tests (i `mobile/`: `npx tsc --noEmit`, `npx eslint .`, `npm test`). Migrationer er nye filer; ingen kørt migration ændres (2.6). Ingen helbredsdata, navne, tokens eller e-mailadresser i notifikationer eller logs. Ingen ai-flow-opgaver: AI'en berøres ikke.

**Afhængigheder:** PR B bygger på PR A (flytning sender en e-mail via outboxen og erstatter triggeren fra PR A). PR C bygger på PR B (statistikken tæller ikke flyttede tider som aflyste). Inden for en PR: backend → frontend → reviewer → security → tester.

### PR A: Notifikationer (branch `feat/notifikationer`)

| # | Agent | Opgave | Filer | Færdig når | Efter |
|---|---|---|---|---|---|
| 11.1 | backend | Tabellen `push_tokens` og `register_push_token()` (identity 4.3) | `supabase/migrations/20261105000100_push_tokens.sql`, `tests/rls/59_push_tokens.sql` | `supabase db reset` og `npm run test:rls` består; RLS-punkt 54 dækket | – |
| 11.2 | backend | Outbox, `clinic_notification_settings`, enums, de tre triggere, `claim_notifications()`, `complete_notification()`, `purge_notifications()`, `enqueue_booking_reminders()` (platform 14.3-14.5, 14.8; clinics 4.3) | `supabase/migrations/20261105000200_notification_outbox.sql`, `tests/rls/60_notification_outbox.sql`, `tests/rls/61_clinic_notification_settings.sql`, `platform/db/database.types.ts` (genereret) | RLS-punkt 55-56 dækket, også at en fejl i enqueue ikke ruller handlingen tilbage, og at `payload` kun har de tilladte nøgler | 11.1 |
| 11.3 | backend | Delt kode i `lib/`: typer, tekster, konstanter (samme tal som SQL), `renderClinicEmail`, `renderPatientPush`, `patientNotificationPath`, `isAllowedNotificationPath`; skemaer for push-tokens og indstillinger (platform 14.7) | `lib/common/{types,constants,domain}/notifications.ts`, `lib/identity/{schemas,constants,types}/push-tokens.ts`, `lib/clinics/{types,schemas,constants}/notification-settings.ts`, unit-tests | Unit: alle typer renderes uden pladsholdere og uden andet end faste tekster, tider og links; HTML escapes; stiernes tilladelsesliste | 11.2 |
| 11.4 | backend | `platform/notifications/`: `EmailService`, `ResendEmailService`, `ConsoleEmailService`, `FakeEmailService`, `PushService`, `ExpoPushService`, `ConsolePushService`, `FakePushService`, `notificationServices.ts`, `NotificationOutboxRepository`, `NotificationDispatcher`, `NotificationController` (platform 14.6); 2.1.1-undtagelsen; lint-regel, så routes kun importerer `notificationController` | `platform/notifications/*`, `platform/__tests__/notifications/*`, `eslint.config.mjs` | Unit-testene i 14.9 består; ingen netværkskald i tests; `createSupabaseAdminClient` bruges stadig kun i `platform/db/admin.ts` | 11.3 |
| 11.5 | backend | `withApi(handler, { notify: true })` med `after()`, de to cron-routes og `notify` på routes'ne i 14.6; `NOTIFICATIONS_FAKE=1` i `tests/api/run.sh` og `tests/e2e/run.sh`; `.env.example` med `RESEND_API_KEY`, `EMAIL_FROM`, `EXPO_ACCESS_TOKEN` (tomme) | `platform/middleware/http.ts`, `app/api/cron/{notifications,booking-reminders}/route.ts`, de berørte `app/api/**/route.ts`, `tests/api/run.sh`, `tests/e2e/run.sh`, `.env.example`, `platform/__tests__/api/notifications.test.ts` | API-testene i 14.9 består; et svar venter ikke på afsendelsen; eksisterende API-tests består uændret | 11.4 |
| 11.6 | backend | Push-tokens-API og eksport (identity 10.15); notifikationsindstillinger- og web push-abonnement-API (clinics 10.19) | `features/identity/{pushTokensController,pushTokensRepository}.ts`, `app/api/push-tokens/route.ts`, eksporten i `features/identity`, `features/clinics/{notificationSettingsController,notificationSettingsRepository}.ts`, `app/api/clinics/me/notification-settings/route.ts`, API-tests i begge domæner | API-testene i identity 10.15 og clinics 10.19 består | 11.5 |
| 11.7 | frontend | Web: sektionen "Notifikationer" på `/klinik/profil` (clinics 6.3) med gruppen Browser (knap til tilladelse, service worker, `POST`/`DELETE /api/web-push-subscriptions`, afmelding ved logout; clinics 10.19) og afsnittet i privatlivspolitikken (site 6.1; web push er allerede skrevet ind) | `features/clinics/components/notification-settings.tsx`, `features/clinics/pages/*profil*`, `features/site/components/privacy-sections.tsx`, evt. `tests/e2e/clinic-notification-settings.spec.ts` | Valgene gemmes og vises igen; `#notifikationer` springer til sektionen; tjekket ved 390 og 1280 px | 11.6 |
| 11.8 | frontend | App: `expo-notifications`, laget `src/notifications/`, kortet efter første henvendelse, rækken i Konto, afmelding ved logud, tryk åbner skærmen (mobile 13.10); lag i `mobile/eslint.config.mjs` | `mobile/package.json`, `mobile/app.json`, `mobile/src/notifications/*`, `mobile/src/api/push-tokens.ts`, `mobile/src/components/notifications/push-prompt-card.tsx`, `mobile/src/auth/session-context.tsx`, `mobile/app/_layout.tsx`, send-, akut- og kontoskærmen, `mobile/tests/{notification-routing,push-prompt}.test.ts` | Jest består; på en fysisk iPhone: tillad efter første henvendelse → accept på weben → push → tryk åbner sagen (eller, hvis Expo Go ikke modtager push, er det noteret i 12.3 punkt 49, og resten virker) | 11.6 |
| 11.9 | reviewer | Gennemgang mod 2.1, 2.1.1, 2.6 og platform 14: lag, ingen domæneimport i `platform/notifications/`, ingen kopier af tekster i `mobile/`, `notify` på alle routes i 14.6 | – | Fund med fil og forslag | 11.7, 11.8 |
| 11.10 | security | Outbox og RLS, service role-brug (2.3 i), at ingen notifikation eller log indeholder helbredsdata, navne, tokens eller adresser, Resend-nøglen kun på serveren, `isAllowedNotificationPath`; opdatér databehandlere og kompromiser i `docs/security.md` (Resend, Expo, Apple) | `docs/security.md` | Ingen kritiske eller høje fund; databehandlerne står i `docs/security.md` | 11.9 |
| 11.11 | tester | Alle suiter og den manuelle tjekliste (14.9, 13.10): e-mail i loggen (Console), evt. én rigtig e-mail via Resend, push på iPhone, påmindelse via manuelt kald af cron-routen | – | `test:rls`, `test:api`, `test:unit`, `tests/ai`, `test:e2e` og appens Jest grønne; tjeklisten gennemgået | 11.10 |

### PR B: Flyt tid, kalender og favoritter (branch `feat/booking-og-favoritter`)

| # | Agent | Opgave | Filer | Færdig når | Efter |
|---|---|---|---|---|---|
| 11.12 | backend | `bookings.rescheduled_from_id`, `reschedule_booking()`, nye kolonner i `patient_bookings()`, `clinic_bookings()`, `clinic_booking()`, og ny version af `notify_after_booking_change()` (booking 10.16, platform 14.4) | `supabase/migrations/20261106000100_reschedule_booking.sql`, `tests/rls/62_reschedule_booking.sql` | RLS-punkt 57 dækket; RLS-test 47 og 54 består uændret | PR A merget |
| 11.13 | backend | API: `GET /api/bookings/{id}/availability`, `POST /api/bookings/{id}/reschedule`, DTO-felterne, fejlkoden og teksterne (booking 10.16) | `features/booking/{bookingsController,bookingsRepository}.ts`, `platform/db/mappers.ts`, `platform/middleware/http.ts`, `lib/booking/{types,schemas,constants,domain}/bookings.ts`, `lib/common/constants/error-texts.ts`, `app/api/bookings/[id]/{availability,reschedule}/route.ts`, `features/booking/__tests__/api/reschedule.test.ts` | API-testene i 10.16 består; outboxen har `clinic_booking_rescheduled` efter en flytning | 11.12 |
| 11.14 | frontend | Web: kalenderen viser "Flyttet af patienten til …" og "Flyttet fra …" (booking 10.16) | `features/booking/components/*` (kalenderen) | Vises korrekt ved 390 og 1280 px; e2e for kalenderen består | 11.13 |
| 11.15 | frontend | App: "Flyt tid" (mobile 13.12) | `mobile/app/bookinger/[bookingId]/flyt.tsx`, ny `mobile/src/screens/reschedule-screen.tsx`, `mobile/src/api/bookings.ts`, `booking-card.tsx`, genbrugte tidsvælger-komponenter | Flytning i appen ses i klinikkens kalender og som e-mail (Console-log); Jest for kortets tekster | 11.13 |
| 11.16 | frontend | App: "Tilføj til kalender" med `expo-calendar` (mobile 13.11) | `mobile/package.json`, `mobile/app.json`, `lib/booking/domain/calendar-event.ts` og test, `booking-card.tsx`, kvitteringerne efter book og flyt | Systemets "Ny begivenhed" åbner udfyldt på iPhone; titel uden behandling; Jest består | 11.15 |
| 11.17 | backend | `favorite_clinics`, `is_public_clinic()` og loftet (clinics 4.3) | `supabase/migrations/20261106000200_favorite_clinics.sql`, `tests/rls/63_favorite_clinics.sql` | RLS-punkt 58 dækket | 11.12 |
| 11.18 | backend | Flyt oversigtens mapping til `ClinicListingService` (ingen adfærdsændring) | `features/clinics/clinicListingService.ts`, `features/clinics/clinicDirectoryController.ts`, unit-test | Alle eksisterende tests for oversigten består uændret | 11.17 |
| 11.19 | backend | Favorit-API og eksport (clinics 10.17) | `features/clinics/{favoritesController,favoritesRepository}.ts`, `app/api/favorites/**/route.ts`, `lib/clinics/{types,constants}/favorites.ts`, `lib/common/constants/error-texts.ts`, eksporten i `features/identity`, `features/clinics/__tests__/api/favorites.test.ts` | API-testene i 10.17 består | 11.18 |
| 11.20 | frontend | App: hjerte på kort og profil, "Gemte klinikker" (mobile 13.12) | `mobile/src/api/favorites.ts`, `mobile/src/components/clinic-directory/*` (kort, hjerte), `mobile/src/screens/clinic-profile-screen.tsx`, ny `mobile/src/screens/favorites-screen.tsx`, `mobile/app/favoritter.tsx`, kontoskærmen, Jest | Gem og fjern virker; uden konto vises kortet "Opret en konto …"; Jest består | 11.19 |
| 11.21 | reviewer | Gennemgang af 11.12-11.20 (ingen kopi af tidsvælger, mapping eller tekster) | – | Fund med fil og forslag | 11.16, 11.20 |
| 11.22 | security | `reschedule_booking()` (atomisk, ejer, frister, loft), favorit-RLS, kalenderindhold uden helbredsdata | – | Ingen kritiske eller høje fund | 11.21 |
| 11.23 | tester | Suiterne og manuel tjekliste på iPhone (flyt, kalender, favoritter) | – | Alle suiter grønne; tjeklisten gennemgået | 11.22 |

### PR C: Klinikkens statistik og admin (branch `feat/statistik-og-admin`)

| # | Agent | Opgave | Filer | Færdig når | Efter |
|---|---|---|---|---|---|
| 11.24 | backend | `clinic_stats()` (clinics 10.18) | `supabase/migrations/20261107000100_clinic_stats.sql`, `tests/rls/64_clinic_stats.sql` | RLS-punkt 59 dækket | PR B merget |
| 11.25 | backend | Statistik-API, `toClinicStatsDto()` og `formatResponseTime()` (clinics 10.18) | `features/clinics/{clinicStatsController,clinicStatsRepository}.ts`, `app/api/clinics/me/stats/route.ts`, `lib/clinics/{types,schemas,constants,domain}/stats.ts`, unit- og API-tests | Testene i 10.18 består | 11.24 |
| 11.26 | frontend | Web: fanen og siden `/klinik/statistik` (clinics 6.3) | `lib/common/navigation/areas.ts`, `features/clinics/pages/clinic-stats-page.tsx`, `features/clinics/components/stats-*.tsx`, `app/klinik/statistik/page.tsx`, evt. e2e | Tallene svarer til API'et; perioden står i URL'en; tjekket ved 390 og 1280 px | 11.25 |
| 11.27 | backend | `admin_actions`, `admin_change_clinic_status()`, `admin_moderate()` (features/admin 4.3, 5.3) | `supabase/migrations/20261107000200_admin.sql`, `tests/rls/65_admin.sql` | RLS-punkt 60 dækket | 11.24 |
| 11.28 | backend | Domænet `features/admin` (lint `DOMAINS`), repositories, controllere, routes, fejlkoder og `scripts/create-admin.ts` (features/admin 10.14) | `features/admin/*`, `app/api/admin/**/route.ts`, `lib/admin/*`, `lib/common/constants/error-texts.ts`, `platform/middleware/http.ts`, `eslint.config.mjs`, `scripts/create-admin.ts`, `package.json` (`admin:create`), `features/admin/__tests__/api/admin.test.ts` | API-testene består; lint håndhæver grænserne for `admin` | 11.27 |
| 11.29 | frontend | Web: `/admin/moderation` og `/admin/klinikker`, layout med `guardArea("admin")`, `AREA_HOME`/`AREA_NAV` for admin (features/admin 6.4) | `app/admin/**`, `features/admin/{pages,components}/*`, `lib/common/navigation/areas.ts`, `tests/e2e/admin.spec.ts` | E2e består ved 390 og 1280 px; en patient eller klinik sendes væk fra `/admin` | 11.28 |
| 11.30 | reviewer | Gennemgang af 11.24-11.29 (nyt domæne efter 2.1/2.2, ingen kopier af labels) | – | Fund med fil og forslag | 11.26, 11.29 |
| 11.31 | security | Isolation i `clinic_stats()`, admin-funktionerne og at admin stadig ikke kan læse sager, leads, bookinger, beskeder, outbox og tokens | – | Ingen kritiske eller høje fund | 11.30 |
| 11.32 | tester | Alle suiter; manuelt: admin godkender en anmeldelse og sætter en klinik på pause; statistikken efter et kendt forløb | – | Alle suiter grønne | 11.31 |

## Kendte problemer

- Chatten i appen fører ikke altid videre til svar-kortene. Årsagerne står i `features/cases/README.md` 7.9a og rettes i trin 9.1-9.6.
- `?services=` filtrerer ikke klinikoversigten; den sorterer kun. Rettes med `onlyOffering` i 9.8-9.9.
- Alle verificerede demoklinikker har samme prisliste (`PRICE_BASE`), så filteret kan ikke ses virke. Rettes i 9.11.
- Løst i 10.12: forespørgslen til `/api/clinics` bygges nu ét sted, `lib/clinics/domain/clinic-query.ts`; weben (`features/clinics/utils/clinic-query.ts`) og appen (`mobile/src/utils/clinic-filters.ts`) kalder den og beholder kun deres egne ekstra felter og URL-tilstand.
- IP-rate limit deler én pulje lokalt, når `x-forwarded-for` mangler (fx 10 nye chats eller konti pr. time i alt).
- 7.12c: `scripts/generate-postal-codes.ts` skriver direkte i den kørte migration `20261028000400`; output-filnavnet bør være et argument.

## Før en demo mod det fælles projekt

1. `supabase db push` for migrationerne `20261027000100`-`20261028000500` (ikke kørt i det fælles projekt endnu).
2. `npm run dev -- -H 0.0.0.0` i roden, og `npx expo start` i `mobile/` (se `README.md`).
3. Evt. demodata: `npm run seed:demo` (lokalt) eller seed-scriptet med `--allow-remote` (det fælles projekt).
