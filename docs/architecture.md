# TandMatch: arkitektur

Version: 2.0 (2026-10-11), klinik- og lead-modellen. Ændringshistorik: `git log -p -- docs/architecture.md`. Dokumentet beskriver den tilstand, koden skal have. Historik hører til i git.
Ejer: architect-agenten. Arbejdsplanen for omlægningen står i `docs/arbejdsplan.md`.

## 0. Sådan bruges dokumentet

- Dette dokument er **sandheden** for datamodel, roller, RLS, routes og API-kontrakter.
- Skal noget ændres (nyt felt, ny route, ændret kontrakt), så ret **dette dokument først** (via architect), og skriv derefter koden. Kode der afviger fra dokumentet er en fejl, indtil dokumentet er opdateret.
- **[ÅBEN]** = ikke besluttet. Byg ikke en endelig løsning på et åbent punkt; brug den markerede MVP-pladsholder.
- **[UDSKUDT]** = bevidst ikke en del af demoen. Må ikke bygges nu, men skal afklares før rigtige brugere.
- **[PROTOTYPE]** = bevidst forenkling for at kunne fremvise. Virker i demoen, men skal genovervejes før rigtige brugere.
- **[IKKE BYGGET]** = besluttet og beskrevet, men endnu ikke implementeret. Markeringen sættes på afsnit eller række og gælder alt derunder. Uden markering findes delen i koden.
- **Status (trin 0 bygget, branch `feat/omlaegning-trin-0`):** den gamle forespørgsels- og tandlægemodel er fjernet fra koden (opgave 0.9, commit `33d066f1`). Databasen for den nye model findes som det samlede migrationssæt (afsnit 4, 5 og 9.1 er bygget). Kernen er omskrevet til klasser efter 2.1.1: vilkårs-gate, auth og signup for patienter, anonym session med tom sag, samtykker, patientprofil, kontosletning, oprydning og billedbehandling (10.2-10.3, delvist). Trin 1 (`feat/omlaegning-trin-1`): klinik-signup, ydelseskatalog og klinikkens egen profil, prisliste, åbningstider, blokeringer, tandlæger og portefølje er bygget (10.2, 10.4, 10.8, 9.5), og det samme er klinikområdets sider (1.6, commit `7da11b5e`) og 1.9 (katalog med kategorier, status `removed`, sletning i triggerne, rate limit på uploads, sikkerhedsheadere, én auth-kontekst pr. request; commits `f9f65607`, `11b04742`, `4f97f313`, `dd283b35` og securitys snapshot-rettelse). Trin 1 er færdigt, inkl. 1.9.7 og 1.9.8 (sidste commit `623314f4`). Trin 2 er færdigt på `feat/omlaegning-trin-2` (sidste commit `98c6a022`): rangering, ledige tider, det offentlige klinik-API (10.7) og den offentlige læsning af anmeldelser, forsiden, informationssiderne, klinikoversigten med kort og klinikprofilen. Trin 3 er færdigt på `feat/omlaegning-trin-3` (sidste commit `13935a3d`): sager, billeder, AI-regler, chat, opsummering og sagsflowets sider (3.1-3.4; 10.5, 10.6, 7, `/start`) samt rettelserne 3.6-3.7. Trin 4 er færdigt på `feat/omlaegning-trin-4`: patientens leads-API (4.1; 10.5), sammenligning og afsendelse (4.2) og patientens sager (4.3) er bygget. Trin 5 er i gang på `feat/omlaegning-trin-5`: klinikkens leads og beskedtråden (5.1-5.2; 10.9, 10.12), klinikkens indbakke og lead-kort (5.3; `/klinik`, `/klinik/lead/[leadId]`) og beskedtråden på patientens sag er bygget, inkl. rettelserne efter review og security (5.5); trin 5 er færdigt. Trin 6 er bygget på `feat/omlaegning-trin-6`: booking, aflysning, udeblivelse og cron (6.1; 10.10), anmeldelser og klinikkens svar (6.2; 10.13), patientens booking og bookinger, klinikkens kalender og anmeldelsessiderne (6.3-6.5) samt rettelserne efter review og security (6.7a-d); trin 6 er færdigt. Akutvejen (10.11), admin (10.14) og de resterende sider i 6 er [IKKE BYGGET]. Markeringen står pr. afsnit eller række. `docs/arbejdsplan.md` fordeler arbejdet.
- Samlet liste over åbne og udskudte punkter i afsnit 12.

### 0.1 Prototype-status

TandMatch er en **prototype** til fremvisning. Alt kan ændres senere, men følgende må ikke gå på kompromis selv i prototypen: klinikker ser aldrig hinandens leads, svar, bookinger eller patienter (RLS); klinikken ser ikke patientens identitet før accepteret lead og booket tid; AI'en nævner aldrig priser og anbefaler aldrig en klinik; samtykke før AI-behandling, billedupload og deling; helbredsdata er aldrig offentligt tilgængelige.

Bevidste prototype-kompromiser [PROTOTYPE]:

| Kompromis | Hvorfor | Hvad en rigtig løsning kræver |
|---|---|---|
| Klinikker verificeres kun i seed-data (`admin_set_clinic_status()`); ingen adminside | Tidsplan | Verifikationsflow (CVR, autorisation) og adminside |
| Importerede klinikker kommer fra seed-data | Importkilde ikke valgt | Import fra CVR eller andet register (12.3) |
| En klinik, der opretter sig med et CVR-nummer, som en importeret klinik har, overtager den importerede række uden bevis for ejerskab | Enkelt demoflow | Bevis for ejerskab før overtagelse. Værnet i dag: den overtagne klinik er usynlig offentligt og kan ikke modtage leads, før admin har verificeret ejeren (12.1) |
| Én kalender pr. klinik: kun én booking ad gangen | Enkel dobbeltbookingsregel | Kalender pr. behandler eller stol (12.3) |
| Ingen e-mailbekræftelse ved kontooprettelse | Enkelt demoflow | Slå e-mailbekræftelse til i Supabase |
| Ingen CAPTCHA på anonyme sessioner; kun rate limits og lofter | Enkelt demoflow | Cloudflare Turnstile |
| En patient med eksisterende konto kan ikke overtage en anonym samtale ved login (kun ny konto) | Undgår flytning af data mellem brugere | Sikker overtagelse via service role (7.7) |
| Oprydning af anonyme sessioner køres af planlagt job eller manuelt | Hosting ikke valgt | Fast planlagt job |
| Polling i stedet for realtime | Enkelhed | Supabase Realtime |
| CSP tillader `'unsafe-inline'` for scripts/styles | Next.js' inline-scripts uden nonce-opsætning | Nonce-baseret CSP via `proxy.ts` (2.4) |
| Signerede billed-URL'er til klinikken indeholder `case_id` i stien (security trin 5, M1) | Ingen patientidentitet; enkel lagring | Sti uden sags-id med opslag i `case_images` (4.4, 9.2) |
| Patienten kan sætte `read_at` på klinikkens beskeder til en vilkårlig værdi (security trin 5, L2) | Påvirker kun visningen | Funktion i stedet for direkte update |
| Ingen IP-grænse på klinikkens GET-routes for leads og beskeder (security trin 5, L3) | Polling hvert 15. sekund; ingen datalæk | Rate limit pr. bruger på GET |
| Kortfliser hentes fra OpenStreetMaps offentlige server | Gratis og enkelt | Egen eller betalt fliseudbyder (OSM's brugspolitik) |
| Brugervilkår, privatlivspolitik og samtykketekster er pladsholdere (`v0-prototype`) | Juridisk tekst ikke skrevet | Skrevne og gennemgåede tekster (12.4) |

### 0.2 Hvor finder jeg hvad

| Spørgsmål | Afsnit |
|---|---|
| Hvilke lag og mapper har projektet, og hvad må importere hvad? | 2.1, 2.2 |
| Hvordan bygger jeg en ny funktion fra ende til anden? | 2.6 |
| Hvilke roller findes, og hvem må hvad? | 3 |
| Hvilke tabeller og felter findes? | 4 |
| Hvem må se og ændre hvad i databasen? | 5 |
| Hvordan skjules patientens kontaktoplysninger for klinikken? | 4.4, 5.5 |
| Hvilke sider findes, og hvordan rangeres klinikker? | 6 |
| Hvordan beregnes ledige tider? | 6.7 |
| Hvad må AI'en, og hvor står reglerne? | 7 |
| Hvordan håndteres billeder, portefølje og samtykke? | 9, 4.3 (`consents`) |
| Hvilke API-routes findes, med input og output? | 10 |
| Hvad er bygget, og hvad mangler? | 11, `docs/arbejdsplan.md` |
| Åbne beslutninger og risici | 12 |

---

## 1. Overblik og principper

TandMatch er en markedsplads, der skaber kvalificerede leads til tandklinikker og giver patienter gennemsigtighed i pris og kvalitet.

```
Patient                                                              Klinik (én konto)
  Forside ──┬── AI-chat (anonym mulig): beskrivelse + billeder
            │     → forslag til ydelser fra kataloget → patienten bekræfter
            │     → opsummering, patienten retter og godkender
            ├── Klinikoversigt: liste + kort + filtre (pris, anmeldelser,
            │     prisnøjagtighed, afstand, første ledige tid)
            └── Akut: klinikker sorteret efter første ledige akuttid
  Vælg op til 3 klinikker → opret konto → samtykke til deling
                         → leads ──────────────────────────────→  Indbakke: ét kort pr. lead
                                                                    Accepter / Accepter med kommentar / Afvis
  Accepteret → patienten booker en ledig tid  ←── kalender (åbningstider, blokeringer, varighed)
           → klinikken ser navn og kontakt for bookingen
  Gennemført booking → anmeldelse med prisnøjagtighed  ──────→   offentligt svar
```

Domænebegreber:

| Begreb | Betydning | Tabel |
|---|---|---|
| Klinik | Kontoen. Profil, prisliste, åbningstider, ledige tider, tandlæger (kun visning) og portefølje | `clinics` m.fl. |
| Ydelseskatalog | Fælles liste over ydelser (kosmetiske, almindelige, akutte). Priser og patientens valg peger på det | `services` |
| Sag | Patientens godkendte opsummering, bekræftede ydelser, billeder og ønsket tidsrum. Kan påbegyndes anonymt | `cases` |
| Lead | En sag sendt til én klinik, som patienten selv har valgt. Maks. 3 pr. sag | `leads` |
| Booking | Kun på et accepteret lead. Gennemført booking = verificeret besøg | `bookings` |
| Anmeldelse | Af klinikken, med prisnøjagtighed. Klinikken kan svare offentligt | `reviews` |

Bærende principper:

1. **Bred før dyb.** Hele rejsen skal virke enkelt og kunne fremvises, før noget poleres.
2. **Klinikkens tid er dyr.** Et lead håndteres på under et minut: ét kort med alt nødvendigt og tre knapper. Leads skal være kvalificerede (bekræftede ydelser, godkendt opsummering, billeder, ønsket tidsrum, listepris set af patienten).
3. **Isolation i databasen.** Klinikker kan aldrig se hinandens leads, svar, bookinger eller patienter. Håndhæves med RLS og `security definer`-læsefunktioner, ikke kun i UI. API-laget tjekker også, men RLS er den sidste barriere.
4. **Kontakt gennem platformen.** Klinikken ser først patientens navn og kontaktoplysninger, når leadet er accepteret og en tid er booket, og kun for den booking (4.4, 5.5).
5. **AI'en vurderer ikke endeligt og sælger ikke.** Den spørger ind, forklarer behandlinger og må give en foreløbig vurdering, altid markeret som foreløbig. Den oversætter ønsket til ydelser fra kataloget, som patienten bekræfter. Den nævner aldrig priser og anbefaler aldrig en klinik. Priser kommer fra klinikkernes prislister, og rækkefølgen af klinikker bestemmes af faste, synlige kriterier (6.6). Reglerne samles i `services/ai/` (7.8).
6. **Helbredsdata (GDPR art. 9).** Tekst, chat og billeder om patientens mund er helbredsdata. Eksplicit samtykke før AI-behandling, upload og deling; dataminimering over for klinikker og OpenAI.
7. **MVC med adskilt frontend og backend.** Databasen tilgås kun via API-routes (2.1). REST og JSON, men pragmatisk, hvis det giver bedre UX.
8. **Simpelt.** Ingen ekstra infrastruktur (køer, caches, realtime, streaming). Next.js + Supabase (EU-region) + OpenAI.

### 1.1 Demo-scope

| I demoen | [UDSKUDT] |
|---|---|
| Vilkårs-gate, login, roller (patient, klinik), navigation, design (hvid og blå) | Streaming af AI-svar, realtime, notifikationer (e-mail/SMS) |
| Ydelseskatalog, klinikprofil med prisliste, åbningstider, tandlæger og portefølje | Adminside til verifikation af klinikker og import |
| Forside, klinikoversigt med liste, kort (Leaflet + OpenStreetMap) og filtre, klinikprofil | Rigtig import af klinikker fra CVR |
| AI-chat med billeder, forslag til ydelser, foreløbig vurdering, akut-henvisning, opsummering | Kalender pr. behandler, synkronisering med klinikkens eget bookingsystem |
| Sammenligning og leads til op til 3 klinikker | Udløb og påmindelser for ubesvarede leads ([ÅBEN] 12.3) |
| Lead-indbakke: accepter, accepter med kommentar, afvis | CAPTCHA, e-mailbekræftelse |
| Booking i klinikkens kalender, aflysning, automatisk gennemførelse, markering af udeblivelse | Opbevaringsperiode for kontodata |
| Anmeldelser efter gennemført booking, prisnøjagtighed, klinikkens svar | Endelige vilkår, MDR-vurdering, databehandleraftaler |
| Akutvej, beskedtråd pr. lead, samtykker, dataeksport, demodata | |

---

## 2. Systemarkitektur (MVC, adskilt frontend og backend)

```
Browser                       Next.js server                                    Eksterne
-----------------             ----------------------------------------------    ---------------
views/pages, views/components                                                    OpenStreetMap-fliser
   │ fetch JSON (views/utils/api-client)                                         (kun browseren, kortet)
   v
app/api/**/route.ts   (Route)       vilkår, session/rolle, parse params/body/query  ── middleware/*
   │ new XController(supabase, session).metode(input)   (præcis ét metodekald)
   v
controllers/*Controller.ts          klasser: forretningsflow pr. ressource, tjek af regler,
   │                                 DTO-formning, oversættelse af fejl
   ├──> services/*Service.ts        klasser: AI, rangering, ledige tider, billeder, sletning  ──> OpenAI API
   v
models/*Repository.ts               klasser (arver BaseRepository): al dataadgang          ──> Supabase Postgres (RLS, EU)
models/base/, models/db/            basisklasse, Supabase-klienter og db-fejl               ──> Supabase Storage (EU)
```

`app/` indeholder kun det, Next.js kræver for routing (sider, layouts, `route.ts`). Al øvrig kode ligger i lagene nedenfor.

**Objektorienteret backend.** Models, services og controllers er klasser, så fælles adfærd ligger ét sted, afhængigheder er synlige i constructoren, og hver del kan testes og udskiftes. Middleware, `lib/`, routes, sider og React-komponenter forbliver funktioner (2.1.1).

### 2.1 Regler for lagene

| Lag | Mappe | Ansvar | Må importere |
|---|---|---|---|
| Routing | `app/` | `page.tsx` re-eksporterer en side fra `views/pages/`. `layout.tsx` kalder områdevagten (`guardArea`/`guardCaseFlow`). `route.ts`: (1) `const gate = await requireTerms()`, som opretter requestens **ene** auth-kontekst og returnerer `{ supabase, userId, terms }` (routes uden vilkårsgate bruger `createAuthContext()` direkte), (2) `requireRole(role, { ctx: gate })`/`requireSession(gate)`/`requireAnonymous(gate)`/`requireAccount()`, så konteksten genbruges, (3) evt. `enforceIpRateLimit()`, (4) `parseId`/`readJson`/`readQuery`, (5) opretter controlleren med `gate.supabase` og kalder **én** metode (`new LeadsController(gate.supabase, session).decide(id, input)`), (6) returnerer JSON. Routen opretter aldrig selv en Supabase-klient. Cookies sættes og slettes her (vilkårs-cookien, `clearAuthCookies()` efter sletning). Undtagelser: `/api/session/anonymous` rate-limiter efter validering, fordi grænsen kun gælder uden session; billedupload sender en læser (`imageFileReader`) til controlleren, så filen først læses efter samtykke- og ejertjekket (9.3). Ingen forretningslogik og ingen modelkald. | `middleware/`, `controllers/`, `views/`, `lib/` (ikke `models/`; klienten kommer fra `requireTerms()`/`createAuthContext()`) |
| Middleware | `middleware/` | Tværgående request-håndtering: `http.ts` (`ApiError`, `withApi`, `readJson`, `readQuery`, `rejectLargeImage`, `imageFileReader`, `readImageForm` (multipart med tekstfelter: felterne valideres med zod, før billedet læses og behandles), `parseId`, `jsonResponse`, `noContent`), `session.ts` (`AuthContext = { supabase, userId }` og `createAuthContext()`, der opretter brugerens klient og verificerer brugeren hos Supabase Auth én gang pr. request; `getSession(ctx?)`, `requireSession(ctx?)`, `requireRole(role, { ctx })`, `requireAnonymous(ctx?)`, `requireAccount`, `clearAuthCookies`), `termsGate.ts` (`requireTerms()` returnerer `TermsGate = { supabase, userId, terms }`, dvs. auth-konteksten plus vilkårs-accepten), `termsCookie.ts`, `rateLimit.ts`, `cron.ts`, `areaGuard.ts` (`guardArea`, `guardCaseFlow`). Funktioner, ikke klasser. Ejerskab af en ressource tjekkes ikke her, men i repositories (`require*`). | `models/`, `lib/` |
| Controller | `controllers/` | Én klasse pr. ressource (`LeadsController` i `leadsController.ts`). **Oprettes pr. request** med `(supabase, session)` og opretter selv de repositories og services, den bruger (2.1.1). Metoderne tager **typet, valideret input** (aldrig `Request`, aldrig cookies), tjekker forretningsregler, kalder repositories og services og returnerer DTO'er. Controllers kalder ikke hinanden; delt logik flyttes til en service. Opretter kun admin-klienten i de tilfælde, der står i 2.3, og giver den videre til det repository, der skal bruge den. | `models/`, `services/`, `middleware/http`, `lib/` |
| Service | `services/` | Klasser med afhængigheder i constructoren: `RankingService` (sortering og filtrering efter faste kriterier, 6.6), `AvailabilityService` (ledige tider, 6.7), `ai/AiChatService` og `ai/AiSummaryService` (OpenAI-klient og `AI_RULES`), `ImageProcessingService` (sharp: filtype, re-encoding, EXIF fjernes), `AccountDeletionService`. Controlleren kalder fx `chatService.sendTurn(...)` eller `rankingService.rank(...)` og kender ikke detaljerne. Rene hjælpefunktioner (PII-maskering, ordfilter, promptformat) må være funktioner. | `models/`, `lib/`, `middleware/http` (kun `ApiError`) |
| Model | `models/` | **Repository-klasser**, én pr. tabel/aggregat (`CasesRepository` i `casesRepository.ts`), plus `AuthRepository` (Supabase Auth). Tabel-repositories arver `BaseRepository` (`models/base/baseRepository.ts`); storage-klasserne (`CaseImageStorage`, `PublicMediaStorage`) arver `BaseStorage` (`models/base/baseStorage.ts`). Alle får Supabase-klienten i constructoren (`new CasesRepository(supabase)`). **Eneste lag, der kalder Supabase.** Metoder med faste navne: `findById`, `findOwn`, `list…`, `create`, `update`, `delete`, `require…` (find eller kast 404/403), og ét navngivet kald pr. RPC (`sendLeads(...)`). Bruger brugerens JWT, så RLS altid gælder, medmindre controlleren har givet admin-klienten (2.3). `models/db/` har klientfabrikkerne (`createSupabaseServerClient`, som kun kaldes af `createAuthContext()`, og `createSupabaseAdminClient`/`lazyAdminClient`), env-konfiguration, `mapDbError` og `authErrors.ts` (`isTransientAuthError()`) (funktioner). | `models/base/`, `models/db/`, `middleware/http` (kun `ApiError`), `lib/` |
| View | `views/` | `views/pages/` (sideindhold), `views/components/` (UI) og `views/utils/` (`api-client.ts`, `api-errors.ts`, `field-errors.ts`, `format.ts`, `map.ts`, `prepare-image.ts` (nedskalering i browseren før upload), `upload-image.ts`, `use-load.ts`, `use-save-state.ts`, `use-action.ts`, `clinic-loaders.ts`, `clinic-query.ts`, `links.ts`, `case-links.ts`, `compare-selection.ts`, `use-case-selection.ts`, `ids.ts`, `lead-status.ts`, `booking-status.ts`, `review-status.ts`, `group-by-day.ts` (`groupByDay`), `clinic-links.ts` (`clinicLeadHref`), `eligible-visits.ts` (`loadEligibleVisits`)). Generiske komponenter i `views/components/ui/` omfatter bl.a. `status-message.tsx`, `load-state.tsx`, `save-bar.tsx` og `slot-days.tsx` (`SlotDays`: ledige tider pr. dag, som tekst på klinikprofilen og som knapper på bookingsiden). Anmeldelsens detaljer og klinikkens svar (`ReviewDetails`, `ReviewReply`) ligger i `views/components/reviews/review-details.tsx`, og teksten til en ikke-verificeret klinik i `views/components/clinic/not-verified-note.tsx`. Henter og skriver **kun** via `/api/*` med `views/utils/api-client`. Generiske hooks og hjælpere ligger i `views/utils/`, generiske komponenter i `views/components/ui/`; de dubleres ikke i domænemapper. | `views/`, `lib/` |
| Delt | `lib/` | Kode uden afhængigheder til andre lag, brugt af både views og server: `types/` (DTO'er, én fil pr. domæne), `schemas/` (zod, én fil pr. domæne), `constants/` (én fil pr. domæne med både værdier og danske visningsnavne), `navigation/`, `domain/` (regler der skal være ens i UI og server). | `lib/` |

- Alle filer i `middleware/`, `controllers/`, `services/` og `models/` starter med `import "server-only"`. Undtaget er ren kode uden I/O, som testes direkte: i `services/ai/` (`rules.ts`, `errors.ts`, `forbiddenTerms.ts`, `guard.ts`, `pii.ts`, `promptFormat.ts`, `schemas.ts`, `catalogContext.ts`, `prompts/`; `aiChatService.ts`, `aiSummaryService.ts`, `fakeAiClient.ts` og `modelClient.ts` har `server-only`) samt `services/rankingService.ts` og `services/availabilityService.ts`. De må ikke importere models eller kalde netværk.
- Reglerne i kolonnen "Må importere" håndhæves af ESLint (`no-restricted-imports` i `eslint.config.mjs`). Type-imports er tilladt på tværs af lag. Imports bruger `@/...`; relative imports op ad træet (`../`) er forbudt.
- Kode, der kun bruges af views, hører til i `views/utils/`, ikke i `lib/` (fx kortopsætning i `views/utils/map.ts`). Undtagelse: danske labels og faste tekster til enums og fejlkoder (fx `LEAD_STATUS_LABEL`, `CASE_TIMEFRAME_LABEL`, beskedtrådens afsenderlabels) ligger i `lib/constants/` ved siden af værdierne, så server og views bruger samme tekst. En fejltekst, som både serveren (`middleware/http.ts`) og views (`views/utils/api-errors.ts`) viser, står kun ét sted i `lib/constants/`.
- Login/logout, anonym session og konvertering til konto går via API'et (`/api/auth/*`, `/api/session/*`), så sessionen sættes som cookie af serveren.
- **Navngivning:** serverlagene bruger `camelCase`-filnavne, og hver klassefil eksporterer præcis én klasse med samme navn i PascalCase: `casesRepository.ts` → `CasesRepository`, `leadsController.ts` → `LeadsController`, `rankingService.ts` → `RankingService`. Repositories hedder efter tabellen i flertal, controllers efter ressourcen, services efter ansvaret. `views/` og `lib/` bruger `kebab-case` (`clinic-card.tsx`). Ressourcenavne på engelsk i kode og API (`case`, `lead`, `booking`, `clinic`, `service`), danske slugs i sider (`/klinikker`, `/sag`). Sagen hedder `case` i kode og `cases` i databasen; da `case` er et reserveret ord i TypeScript, bruges `caseRow`/`patientCase` som variabelnavne.
- **Ét sted pr. domæne:** hver ressource har højst én fil i hver af `lib/types/`, `lib/schemas/` og `lib/constants/` med samme navn (`leads.ts`). Statusser, enum-værdier og deres danske visningsnavne står kun i `lib/constants/`. Ingen dubletter i komponenter.
- **Fælles skemaer:** felter, der valideres ens flere steder, har ét skema i `lib/schemas/` (fx ét postnummer-skema til både klinik og patient). AI-opsummeringens zod-skema ligger i `lib/constants/ai-schemas.ts`, fordi det både bruges af AI-laget og af `lib/schemas/aiSummary.ts`; typerne udledes med `z.infer`. Lofter i fejlbeskeder (API og `views/utils/api-errors.ts`) bruger konstanterne, aldrig hardcodede tal.
- **Værdier først, typer udledt:** hver enum-lignende værdimængde defineres én gang som `as const`-array i `lib/constants/<domæne>.ts`, og typen udledes i `lib/types/` (`export type Role = (typeof ROLES)[number]`). zod-skemaer bruger samme array (`z.enum(ROLES)`). Mønstret fra `CONSENT_TYPES` gælder for alle: `ROLES` (`lib/constants/roles.ts`), `CASE_STATUSES` og `CASE_TIMEFRAMES` (`lib/constants/cases.ts`), `LEAD_STATUSES`, `LEAD_DECLINE_REASONS`, `BOOKING_STATUSES`, `CLINIC_STATUSES`, `CLINIC_TIERS`, `WEEKDAYS`, `SERVICE_CATEGORIES`, `PRICE_ACCURACY_VALUES`. Typer må ikke skrives som håndskrevne string-unions ved siden af. Værdierne skal svare til Postgres-enums i 4.2.
- Ny ressource eller funktion: følg opskriften i 2.6.

### 2.1.1 Klasser i backend

**Hvad er klasser, og hvad er funktioner**

| Klasser | Funktioner |
|---|---|
| Repositories i `models/` (arver `BaseRepository`) | Middleware (`withApi`, `requireRole`, `guardArea` …), medmindre en klasse giver reelt genbrug |
| Services i `services/` | `models/db/` (klientfabrikker, `mapDbError`) |
| Controllers i `controllers/` | `route.ts`, `page.tsx`, `layout.tsx` (Next.js kræver funktioner) og React-komponenter (funktionelle) |
| | `lib/`: DTO-typer, zod-skemaer, konstanter og domæneregler (data og rene funktioner, ikke klasser) |
| | Rene hjælpefunktioner (fx `maskPii`, `findForbiddenTerms`, `formatPatientInput`) og `AI_RULES` (konstant) |

**`BaseRepository`** (`models/base/baseRepository.ts`) samler det, der ellers gentages i hvert repository:
- `constructor(protected readonly db: SupabaseClient)`.
- Fejloversættelse: alle kald går gennem en beskyttet hjælper (fx `this.run(query)`/`this.rpc(name, args)`), der kalder `mapDbError` og kaster `ApiError`.
- Mapping `snake_case` → DTO: hvert repository angiver sin række-mapper (`protected toDto(row)`), og basisklassen bruger den på enkelte rækker og lister.
- "Find eller kast": `protected requireRow(row, { notFound, forbidden })` kaster 404 (eller 403, hvor 2.4 tillader det). Repositories bygger deres `require…`-metoder (`requireOwn(caseId)`) på den.
- Storage-repositories har en tilsvarende basisklasse (`models/base/baseStorage.ts`) med bucket-navn, upload, sletning og signering.

**Afhængigheder gives i constructoren.** En klasse opretter ikke skjult sine afhængigheder inde i metoderne. Services får deres afhængigheder direkte i constructoren (`new AiChatService(openAiClient, AI_RULES)`, `new AccountDeletionService(adminClient)`); statiske fabriksmetoder (`forAdmin(...)`) bruges ikke.

**Controller-signaturer (besluttet):**
- Alle controllere med en bruger: `constructor(supabase: SupabaseClient, session: Session, deps: Partial<XDeps> = {})`. Det gælder også `ExportController` (eksporten læser med brugerens JWT, så RLS gælder). Repositories og services bygges i constructoren ud fra `deps` eller standardværdier.
- Undtagelser:
  - `CronController` kaldes af planlagte jobs uden session: `constructor(deps: Partial<CronDeps> = {})`. Den har ingen brugerklient og bruger kun service role-klienten (2.3 g).
  - Controllere for offentlige routes, som også kan kaldes uden login, tager `session: Session | null`: `ServicesController` og `ClinicDirectoryController`. De bruger kun brugerens klient (anon-nøglen, når der ikke er en session) og aldrig service role.
  - Nye controllere uden session er ikke tilladt uden at blive beskrevet her.
- `deps` bruges kun til at erstatte afhængigheder i tests.

**Service role-klienten i controllere (besluttet):**
- `createSupabaseAdminClient()` kaldes **kun** fra `lazyAdminClient()` i `models/db/admin.ts` (og fra scripts). Controllere og services kalder den aldrig direkte.
- En controller, der må bruge service role (2.3), har feltet `private readonly admin: () => SupabaseClient`, sat i constructoren til `deps.admin ?? lazyAdminClient()`. `lazyAdminClient()` returnerer en getter, der opretter klienten ved første kald og genbruger den inden for samme controller-instans (dvs. samme request).
- Klienten bruges kun ved at give `this.admin()` videre til et repository, en storage-klasse eller en service (`new CaseImageStorage(this.admin())`), og hvert kald har en kommentar med formålet fra 2.3 (fx `// 2.3 (c)`).
- Service role bruges aldrig til opslag på brugerens vegne. Data, der afgør, hvad der må ske (fx klinikkens id før sletning eller upload), hentes med brugerens klient (`ClinicsRepository.requireOwnId()`), og først derefter bruges `this.admin()` til filer, auth-bruger eller AI-skrivninger.
- Controllere, der ikke må bruge service role, har ikke feltet. Reviewer tjekker, at `createSupabaseAdminClient` kun findes i `models/db/admin.ts` og `scripts/`.

**Rækker fra databasen valideres ikke med zod (besluttet):**
- Repositories stoler på databasens typer. Typerne genereres med `supabase gen types typescript --local` til `models/db/database.types.ts`, og `BaseRepository` er generisk over tabellens rækketype. `toDto(row)` mapper typet række til DTO uden runtime-validering.
- **Undtagelse:** `jsonb`-kolonner (fx `cases.ai_summary`) har typen `Json` i de genererede typer og parses med zod-skemaet fra `lib/schemas/` eller `services/ai/schemas.ts`, når de læses. Ugyldigt indhold behandles som `null` og logges uden indhold.
- zod bruges ellers kun på input til API'et (`lib/schemas/`) og på AI-output (7.4). `ProfilesRepository` følger samme mønster som de øvrige repositories.

**Ingen tilstand på tværs af requests.** Instanser oprettes pr. request og kasseres bagefter. Der må ikke være modul-singletons med en Supabase-klient, en session eller brugerdata, og ingen statiske felter med muterbar tilstand. Uforanderlig konfiguration (konstanter, `AI_RULES`, en OpenAI-klient uden brugerdata) må deles.

**Arv og genbrug:** arv kun fra basisklasserne i `models/base/`. Ellers bruges komposition (en controller har repositories og services som felter).

**Klinikcontrollerne (besluttet): komposition, ingen fælles basisklasse.** `ClinicsController`, `ClinicDentistsController` og `PortfolioController` deler ejertjek, billedbehandling og service role-klient, men det er tre linjer hver, og en basisklasse ville koble dem. Mønstret:
- Ejertjek: `ClinicsRepository.requireOwnId(ownerId)` returnerer klinikkens id eller kaster 404. Én metode, ingen kopier i controllerne.
- Billeder: feltet `images = deps.images ?? new ImageProcessingService()`.
- Service role: feltet `admin = deps.admin ?? lazyAdminClient()` (ovenfor).
- Delt ren logik ligger i `lib/domain/` (fx `attachPortfolio()`), delt logik med I/O i en service.
Opstår der senere reel gentagelse i flere end tre controllere, beskrives en basisklasse her først (`controllers/base/`).

**Fælles hjælpere i `BaseRepository`:** al databaseadgang går gennem de beskyttede hjælpere (`run`, `rpc`, `count`), så `mapDbError` altid bruges. Repositories laver ikke egne forespørgsler uden om dem. Typealiaser i et repository eksporteres kun, hvis de bruges uden for filen; delte typer udledes af zod-skemaerne i `lib/schemas/` (fx `NewClinicPrice = z.infer<typeof clinicPriceSchema>`).

Importreglerne og lagdelingen i 2.1 er uændrede, og ESLint håndhæver dem fortsat.

### 2.2 Mappestruktur

```
app/                         kun Next.js-routing
  layout.tsx, globals.css, error.tsx, not-found.tsx
  <rute>/page.tsx            export { default, metadata } from "@/views/pages/<rute>/page"
  patient/layout.tsx         guardArea("patient", …)
  klinik/layout.tsx          guardArea("clinic", …)
  start/[caseId]/layout.tsx  guardCaseFlow()  (patient, anonym tilladt)
  api/**/route.ts            tynde routes (2.1)
middleware/                  http.ts, session.ts, termsGate.ts, termsCookie.ts, rateLimit.ts, cron.ts, areaGuard.ts
controllers/                 én klasse pr. fil: authController (AuthController), sessionController, meController,
                             termsController, cronController, consentsController, patientsController, exportController,
                             servicesController, casesController, caseImagesController, chatController, summaryController,
                             clinicDirectoryController (offentlig oversigt, profil, ledige tider),
                             clinicsController (egen klinik: profil, prisliste, åbningstider, blokeringer),
                             clinicDentistsController, portfolioController,
                             leadsController, bookingsController, messagesController, reviewsController
services/
  ai/                        aiChatService.ts (AiChatService), aiSummaryService.ts (AiSummaryService),
                             modelClient.ts (kald til modellen), fakeAiClient.ts (testklient, 7),
                             openai.ts (klientfabrik), rules.ts (AI_RULES, 7.8), catalogContext.ts,
                             guard.ts, forbiddenTerms.ts, pii.ts, schemas.ts, errors.ts, promptFormat.ts, prompts/
  aiImageService.ts          AiImageService: billeder til AI'en (re-encodet, max 1024 px)
  caseImageUrlService.ts     CaseImageUrlService: signerede URL'er til sagens billeder (9.2)
  rankingService.ts          RankingService: sortering og filtrering af klinikker (6.6), ingen I/O
  availabilityService.ts     AvailabilityService: ledige tider (6.7), ingen I/O
  imageProcessingService.ts  ImageProcessingService: sharp, filtype, re-encoding, EXIF fjernes
  accountDeletionService.ts  AccountDeletionService: sletning af konto, billedfiler og auth-bruger
models/
  base/                      baseRepository.ts (BaseRepository), baseStorage.ts (BaseStorage)
  db/                        supabase.ts (brugerens JWT), admin.ts (createSupabaseAdminClient, lazyAdminClient; kun 2.3),
                             config.ts, errors.ts, authErrors.ts (isTransientAuthError) (funktioner),
                             database.types.ts (genereret, 2.1.1)
  authRepository.ts, profilesRepository.ts, patientsRepository.ts, termsRepository.ts, consentsRepository.ts,
  rateLimitRepository.ts, cleanupRepository.ts
  servicesRepository.ts, casesRepository.ts, caseServicesRepository.ts, caseImagesRepository.ts, chatRepository.ts,
  summaryRepository.ts
  clinicsRepository.ts, clinicDirectoryRepository.ts (public_*-funktioner), clinicDentistsRepository.ts,
  portfolioRepository.ts, availabilityRepository.ts (åbningstider, blokeringer, optaget tid)
  leadsRepository.ts, bookingsRepository.ts, messagesRepository.ts, reviewsRepository.ts
  caseImageStorage.ts (bucket case-images), publicMediaStorage.ts (bucket public-media)
views/
  pages/                     sideindhold, spejler ruterne i app/
  components/
    ui/                      fælles byggeklodser (knapper, felter, kort, badges …)
    layout/, session/, auth/
    chat/                    chatpanel med forslag til ydelser, foreløbig vurdering og akut-henvisning
    case/                    sagsflowet: billeder, samtykke, ydelser, opsummering, send, slet samtale
    home/                    forsidens sektioner (indgange, "Jeg har ondt")
    clinic-directory/        offentlig oversigt og profil: klinikkort, filtre, kort (Leaflet), sammenligning,
                             Trustpilot, stjerner, anmeldelser, portefølje, niveaumærke (TierBadge), adresseblok (ClinicWhere)
    clinic/                  klinikområdet: lead-indbakke, lead-kort, beslutning, profil-, prisliste-,
                             åbningstids- og tandlægeformularer, portefølje, kalender, anmeldelser
    patient/                 mine sager, leads, booking, bookinger, samtykker, eksport, anmeldelser
    messages/                beskedtråd pr. lead
    emergency/               akutvejen
  utils/                     api-client.ts, api-errors.ts, field-errors.ts, format.ts, map.ts,
                             prepare-image.ts (nedskalering før upload; genbruges af sagsflowet i 3.4),
                             upload-image.ts (uploadImage(url, file, { maxDimension, fields })),
                             use-load.ts (hentning med indlæsnings- og fejltilstand), use-save-state.ts (gem-tilstand),
                             use-action.ts (knaphandlinger med fejl og ventetilstand),
                             clinic-loaders.ts (fælles hentning af egen klinik og kataloget),
                             clinic-query.ts (oversigtens filtre ↔ query-parametre/URL),
                             links.ts (eksterne links med rel="noopener noreferrer nofollow ugc"),
                             map.ts (Leaflet-opsætning, fliser og kreditering)
                             case-links.ts (stier til sagsflow, oversigt med ?sag=, afsendelse og sagsside),
                             compare-selection.ts (valgte klinikker pr. sag i sessionStorage, kun id og navn),
                             use-case-selection.ts (sag, leads, ledige pladser og valg af klinikker, useCaseChoices),
                             ids.ts (isUuid)
    (components/ui/ har de generiske status-message.tsx, load-state.tsx og save-bar.tsx)
lib/
  types/                     common, auth, consents, patients, ai, services, cases, clinics, leads, bookings,
                             messages, reviews
  schemas/                   samme domæner som types (+ session, terms)
  constants/                 roles, consents, legal, limits, sessions, ai-texts, services, cases, clinics, leads,
                             bookings, reviews
  navigation/                områder og sikre redirect-stier
  domain/                    regler og ren logik delt af UI og server, eller af flere controllere uden at de kalder
                             hinanden: dentists.ts (attachPortfolio), leads.ts (fx canSendMoreLeads), bookings.ts (fx canCancel)
supabase/
  config.toml                lokal Supabase (anonyme logins til, e-mailbekræftelse fra)
  migrations/                det samlede sæt (11)
  seed.sql                   kun referencedata, som ikke kræver auth-brugere (postnumre)
tests/
  ai/                        provokationstests for chat og opsummering
  rls/                       RLS-tests (5.6), køres mod lokal Supabase
  unit/                      rene funktioner: ranking, availability, prisnøjagtighed, AI-guard
  api/                       API-tests med Node test runner mod lokal Supabase (`npm run test:api`):
                             vilkårs-gate, samtykker, sessioner m.m. (5.6, API-tests)
  e2e/                       Playwright, 390 px og 1280 px
scripts/                     seed-demo.ts, unseed-demo.ts
proxy.ts                     session-refresh og grov rolle-redirect (Next 16)
```

### 2.3 Nøgler, miljøvariabler og hosting

| Variabel | Hvor | Bemærkning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server (og evt. klient) | Offentlig |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server (og evt. klient) | Offentlig af design, beskyttet af RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | kun server, kun via `createSupabaseAdminClient()` | Må **kun** bruges til: (a) AI-skrivninger `append_assistant_message()` og `store_ai_summary()` (5.3), (b) `try_consume_anonymous_ai_call()` og `consume_rate_limit()` (5.3), (c) upload og sletning af billedfiler og `case_images`-rækker, også ved sletning af sag og tilbagetrækning af samtykke (9.2-9.4), (d) upload og sletning i den offentlige bucket `public-media` efter ejertjek (9.5), (e) signering af URL'er til `case-images`, efter at stien er hentet gennem en RLS-beskyttet læsning (9.2), (f) sletning af auth-bruger ved kontosletning eller sletning af anonym session, (g) de planlagte jobs: oprydning af anonyme sessioner (7.7) og `complete_due_bookings()` (5.3), (h) seed- og admin-scripts, herunder `admin_set_clinic_status()`. Aldrig til at læse data på brugerens vegne |
| `OPENAI_API_KEY` | kun server | |
| `OPENAI_MODEL` | kun server | Model med vision + structured outputs. Falder tilbage til `DEFAULT_MODEL` i `services/ai/openai.ts` |
| `CRON_SECRET` | kun server | Beskytter `/api/cron/cleanup-anonymous` og `/api/cron/complete-bookings` |
| `TERMS_COOKIE_SECRET` | kun server | HMAC-nøgle til vilkårs-cookien (2.5) |

Kun `.env.example` committes. Tests bruger `.env.test.local` med den lokale Supabase' URL og nøgler (`supabase status`); filen committes ikke.

**Hvorfor service role til AI-skrivninger:** patienten må ikke kunne skrive AI-svar eller opsummeringer selv. AI-skrivningerne sker via `security definer`-funktioner, som kun `service_role` må udføre. Serveren kalder dem efter validering.

Hosting: Supabase-projektet ligger i **EU-region**. Hosting af Next.js-appen: **[ÅBEN]** (fx Vercel med EU-region for functions).

### 2.3.1 Supabase-opsætning

| Indstilling | Værdi | Hvorfor |
|---|---|---|
| Region | EU | GDPR |
| Auth > Anonymous sign-ins | Slået til | Kræves af `/api/session/anonymous` (7.7) |
| Auth > Confirm email | Slået fra [PROTOTYPE] | Signup og convert forventer, at kontoen er aktiv med det samme |
| Auth > rate limit for anonyme logins | Lav, fx 10 pr. time pr. IP | Misbrugsværn (7.6) |
| Extension `btree_gist` | Slået til (i migrationen) | Udelukkelse af overlappende bookinger (4.3 `bookings`) |
| Migrationer | `supabase/migrations/*` i nummerorden | Skema, RLS, funktioner, katalog |

**Oversigt over persondata:** `docs/security.md` beskriver, hvilke data der behandles, til hvilket formål, hvor længe de opbevares, og hvem der har adgang (vedligeholdes af security-agenten; oprettes i 1.9.7).

**Efter nulstilling af det fælles projekt (arbejdsplan 0.8)** skal det tjekkes, at `pg_policies` er tom for schema `storage` (de gamle storage-policies er væk; det nye sæt opretter ingen for `case-images`), og at der ikke findes gamle buckets (fx `request-images`, `public-profile`); kun `case-images` og `public-media` må findes. Auth > minimum adgangskodelængde: 8 (samme som API'ets validering).

Samme indstillinger står i `supabase/config.toml`, så lokal Supabase (`supabase start`, `supabase db reset`) svarer til det fælles projekt. Tests kører altid lokalt, aldrig mod det fælles projekt.

### 2.4 Fælles API-konventioner

- JSON ind og ud. Tidspunkter som ISO 8601-strenge (UTC). Ugedage og klokkeslæt i åbningstider er lokal tid i `Europe/Copenhagen`. Beløb i hele kroner (`integer`, DKK). Varighed i minutter.
- Feltnavne i JSON: `camelCase`. Kolonner i databasen: `snake_case`. Mapping sker i `models/`.
- Fejlformat for alle routes:
  ```ts
  type ApiError = { error: { code: string; message: string } }; // message på dansk, uden interne detaljer
  ```
- Statuskoder: 200, 201, 204, 400 (validering), 401 (ikke logget ind), 403 (forkert rolle/ejer/manglende samtykke), 404 (findes ikke **eller** ingen adgang; vi skelner ikke), 409 (forkert tilstand, fx lead ikke accepteret, tiden er taget), 413 (fil for stor), 429 (rate limit eller loft), 500, 503 (`AUTH_UNAVAILABLE`: Supabase Auth svarede midlertidigt ikke; klienten må prøve igen).
- **Midlertidige Auth-fejl er ikke "logget ud":** fejl, som `isTransientAuthError()` (`models/db/authErrors.ts`) genkender (netværksfejl, `AuthRetryableFetchError`, 5xx), giver 503 `AUTH_UNAVAILABLE` og bliver aldrig til 401 eller en redirect til login. `proxy.ts` og områdevagterne behandler dem på samme måde.
- **Én auth-kontekst pr. request:** brugerens klient og bruger-id oprettes én gang (`createAuthContext()`, normalt via `requireTerms()`) og gives videre til rolletjek og controller, så sessionen kun verificeres og evt. fornyes ét sted pr. request (2.1, 12.1).
- Auth: Supabase Auth med `@supabase/ssr`, session i `httpOnly`, `secure`, `sameSite=lax`-cookies sat af serveren. Browseren bruger aldrig Supabase-klienten selv.
- Ingen streaming. Alle svar, også AI-svar, returneres som ét samlet JSON-svar efter validering.
- **Sikkerhedsheadere** sættes for alle sider og routes i `next.config.ts` (`headers()`) (bygget i 1.9; den præcise CSP og evt. [PROTOTYPE]-kompromiser afgøres af security):
  - `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data: blob:` + Supabase-projektets URL (`public-media` og signerede URL'er fra `case-images`) + OpenStreetMaps fliseserver fra trin 2; `connect-src 'self'` (browseren kalder kun vores eget API, aldrig Supabase direkte); `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. Scripts og styles tillader i prototypen `'unsafe-inline'` [PROTOTYPE, 0.1]; nonce-løsning senere.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (ældre browsere), `Permissions-Policy` uden kamera/mikrofon/geolokation, undtagen `geolocation=(self)`, når kortet bruger position (trin 2).
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` sættes kun i produktion (ikke lokalt over http). Endnu ikke tjekket i en produktionsbuild.
- Mangler gyldig vilkårs-accept, svarer API'et 403 `TERMS_REQUIRED` (2.5).

### 2.5 Vilkårs-gate

Bygget; uændret i den nye model, bortset fra rollenavnet `clinic`.

Alle, også besøgende uden session og anonyme patienter, skal acceptere **brugervilkår** og bekræfte at have læst **privatlivspolitikken**, før de kan bruge siden. Aktuelle versioner står i `lib/constants/legal.ts` (`TERMS_VERSION`, `PRIVACY_VERSION`), i prototypen `v0-prototype`. Ændres en version, kræves ny accept.

**Hvor accepten gemmes:**
1. **Uden session:** `POST /api/terms/accept` sætter en `httpOnly`, `secure`, `sameSite=lax`-cookie `tm_terms` med `{ termsVersion, privacyVersion, acceptedAt }`, signeret med HMAC (`TERMS_COOKIE_SECRET`), levetid 12 måneder. Ingen session eller databaserække for besøgende, der kun kigger.
2. **Med session** (anonym patient, patient, klinik, admin): accepten skrives i `terms_acceptances` (a) når en session oprettes (`/api/session/anonymous`, `/api/auth/signup`, `/api/auth/login`, `/api/auth/convert`), med cookiens `acceptedAt`, og (b) når en bruger med session accepterer en ny version.

**Håndhævelse:**
- **Sider:** `proxy.ts` kræver gyldig `tm_terms` med aktuelle versioner, ellers redirect til `/vilkaar/accepter?naeste=<sti>`. Undtaget: `/vilkaar*`, `/privatliv` og statiske filer.
- **API:** `proxy.ts` lader `/api/*` passere. Hver route kalder `requireTerms()` (`middleware/termsGate.ts`) før rolletjek: gyldig cookie **eller**, med session, en række i `terms_acceptances`. Ellers 403 `TERMS_REQUIRED`. Undtaget: `/api/terms/*`, `/api/cron/*`, `POST /api/auth/logout`.
- **`naeste`** valideres som relativ sti på samme site af `safeInternalPath()` i `lib/navigation/paths.ts`; ugyldige værdier bliver `/`.

**Vilkårs-accept er IKKE samtykke.** Samtykke efter GDPR art. 9 til AI-behandling (`ai_processing`), billedupload (`image_upload`) og deling med klinikker (`health_data_sharing`) indhentes særskilt, i konteksten, med egne ikke-forudafkrydsede felter, og gemmes i `consents` (4.3). Ingen route må bruge vilkårs-accept som grundlag for upload, AI-kald eller deling.

### 2.6 Sådan bygger du en ny funktion

Rækkefølgen er fast. Lint fejler, hvis lagreglerne i 2.1 brydes.

| # | Trin | Hvor | Hvad |
|---|---|---|---|
| 1 | Beskriv | `docs/architecture.md` | Tabeller (4), RLS (5), route og DTO (10). Kode der afviger fra dokumentet er en fejl |
| 2 | Database | `supabase/migrations/<tidsstempel>_<navn>.sql` | Tabel, RLS på, policies, evt. `security definer`-funktion (regler i 5.1). Ny fil; ret aldrig en kørt migration. Undtagelse: det samlede sæt i 11 må rettes, indtil det er kørt i det fælles projekt |
| 3 | Delte typer | `lib/types/<domæne>.ts`, `lib/schemas/<domæne>.ts`, `lib/constants/<domæne>.ts` | DTO'er (camelCase), zod-skema for input, værdier og danske visningsnavne. Findes filen, udvides den; der oprettes ikke en ny ved siden af |
| 4 | Repository | `models/<x>Repository.ts` (`class XRepository extends BaseRepository`) | Eneste sted med Supabase-kald. Implementér `toDto(row)`; byg `require…`-metoder på `requireRow`. Findes repositoriet, udvides det |
| 5 | Service (kun ved behov) | `services/<x>Service.ts` (`class XService`) | Logik, som flere controllers deler, eller rene beregninger (rangering, ledige tider). Afhængigheder i constructoren |
| 6 | Controller | `controllers/<x>Controller.ts` (`class XController`) | `constructor(supabase, session)` opretter repositories og services. Én metode pr. handling; tager typet input, returnerer DTO. Fejl som `ApiError` med dansk besked |
| 7 | Route | `app/api/<x>/route.ts` | Kun: `const gate = await requireTerms()` → `requireRole(role, { ctx: gate })` eller `requireSession(gate)` → evt. rate limit → parse input → `new XController(gate.supabase, session).metode(input)` → JSON. Routen kalder aldrig `createSupabaseServerClient()` |
| 8 | Side | `views/pages/<rute>/page.tsx` + `app/<rute>/page.tsx` | Siden henter via `views/utils/api-client`. `app/` re-eksporterer kun |
| 9 | Test og review | `tests/rls/`, `tests/unit/`, `tests/ai/`, `tests/e2e/` | RLS-test for nye policies (5.6), enhedstest af services (afhængigheder erstattes via constructoren), AI-tests ved promptændringer. Kør `npx tsc --noEmit`, `npm run lint`, `npm run build`, derefter reviewer og tester |

Et kald gennem lagene, fx `POST /api/leads/{id}/decision`:

```
views/components/clinic/lead-decision.tsx  apiRequest(`/api/leads/${id}/decision`, { method: "POST", body })
app/api/leads/[id]/decision/route.ts       const gate = await requireTerms()
                                           const session = await requireRole("clinic", { ctx: gate })
                                           → parseId() → readJson(req, leadDecisionSchema)
                                           → new LeadsController(gate.supabase, session).decide(leadId, input)
controllers/leadsController.ts             class LeadsController {
                                             constructor(supabase, session) { this.leads = new LeadsRepository(supabase) }
                                             async decide(leadId, input) { await this.leads.requireOwnForClinic(leadId);
                                                                           await this.leads.decide(leadId, input);
                                                                           return this.leads.getClinicDetail(leadId) } }
models/leadsRepository.ts                  class LeadsRepository extends BaseRepository {
                                             decide(...) → this.rpc("clinic_decide_lead", …)   (brugerens JWT, RLS gælder) }
                                           ← ClinicLeadDetailDto som JSON
```

Skitse af en repository-klasse (navne og signaturer er bindende, implementeringen er backends):

```ts
// models/casesRepository.ts
import "server-only";
export class CasesRepository extends BaseRepository<CaseRow, CaseDto> {
  protected toDto(row: CaseRow): CaseDto { /* snake_case → camelCase */ }
  findOwn(caseId: string): Promise<CaseDto | null>;
  requireOwn(caseId: string): Promise<CaseDto>;          // 404, hvis ikke egen
  create(patientId: string): Promise<CaseDto>;
  update(caseId: string, patch: CasePatch): Promise<CaseDto>;
}
```

---

## 3. Roller og rettigheder

Status: rollerne og rettighederne er bygget i databasen (trin 0). Klinikkens signup, opsætnings-API og opsætningssider er bygget (trin 1); patientens leads og sagssider er bygget (trin 4); klinikkens leads, indbakke og beskedtråd er bygget (trin 5); booking, kalender og anmeldelser er bygget (trin 6); akutvejen, admin og de resterende patientsider (`/patient/samtykker`, `/patient/konto`) er [IKKE BYGGET] (trin 7 eller senere).

Rolle gemmes i `profiles.role` (`patient` | `clinic` | `admin`). Rollen sættes ved oprettelse og kan **ikke** ændres af brugeren. `admin` sættes manuelt i databasen.

Alle brugertyper skal først passere vilkårs-gaten (2.5). Brugertyper:
- **Besøgende:** ingen session. Ser offentligt indhold: forside, klinikoversigt, klinikprofiler, anmeldelser.
- **Anonym patient:** anonym Supabase-session (`role = 'patient'`, `is_anonymous = true`), oprettet når den besøgende giver AI-samtykke og starter chatten (7.7). Kan have én kladde-sag med chat, billeder, ydelser og opsummering. Data slettes efter 48 timers inaktivitet.
- **Patient:** permanent konto. En anonym patient bliver patient ved at oprette konto, med samme bruger-id.
- **Klinik:** permanent konto, der ejer præcis én klinik (`clinics.owner_id`). Klinikkens tandlæger har intet login; de vises kun på profilen.
- **Admin:** permanent konto. Moderation og klinikstatus.

**Klinikkens status** (`clinics.status`), se også 4.3:

| Status | Har konto | Vises offentligt | Kan modtage leads og bookinger |
|---|---|---|---|
| `imported` (og `owner_id is null`) | nej | grunddata og Trustpilot, hvis kendt (6.6, niveau "basis"). Ingen egne anmeldelser | nej |
| `registered` | ja | **nej, usynlig offentligt**, indtil den er verificeret. Det gælder også en importeret klinik, der er overtaget via CVR: den forsvinder fra oversigten, indtil ejeren er verificeret, så en uverificeret ejer aldrig kan ændre, hvad patienter ser. Klinikken kan udfylde profil, prisliste, åbningstider, tandlæger og portefølje og se en forhåndsvisning | nej |
| `verified` | ja | fuld profil (niveau "fuld"): priser, ledige tider, tandlæger, portefølje, egne anmeldelser og prisnøjagtighed, kan vælges | ja |
| `removed` | nej (kontoen er slettet) | **nej**, vises ingen steder, heller ikke anmeldelser. Rækken bevares kun, så patienternes historik (leads, beskeder, bookinger, egne anmeldelser) har en klinik at pege på, med navnet og "Klinikken er ikke længere på TandMatch" | nej. Kan heller ikke overtages via CVR |

Status ændres kun af admin (eller seed via `admin_set_clinic_status()`, 5.3). Den præcise visuelle udformning af basisniveauet designes senere.

| Handling | Besøgende | Anonym patient | Patient | Klinik | Admin |
|---|---|---|---|---|---|
| Se klinikoversigt, kort, profiler, godkendte anmeldelser og svar | ja | ja | ja | ja | ja |
| Starte chat (giver AI-samtykke → anonym session) | ja | | | | |
| Chatte med AI'en, uploade billeder (med samtykke), bekræfte ydelser, godkende opsummering | | ja, egen kladde (max 1) | ja, egne sager | | |
| **Sende leads** (op til 3 aktive pr. sag, 4.3) | | **nej, skal oprette konto** | ja | | |
| Trække et ubesvaret lead tilbage (status `sent`) | | | egne | | |
| Lukke en sag (`close_case()`) | | egen kladde | egne | | |
| Slette kontoen | | ja (patientdata) | ja | ja (klinikken bliver `imported`, 5.3) | |
| Se en sag (opsummering, ydelser, billeder) | | egen | egne | kun via egne leads, og kun når sagen er sendt til klinikken | nej |
| Se AI-chatten | | egen | egne | **aldrig** | nej |
| Se leads | | | alle på egne sager | **kun egne leads** | nej |
| Accepter / afvis lead | | | | egne leads | |
| Booke tid | | | på egne accepterede leads | | |
| Se patientens navn og kontaktoplysninger | | | egne | **kun for egne bookinger med status `booked`/`completed`** | nej |
| Aflyse booking | | | egne, før starttid | egne, før starttid | |
| Markere booking som udeblevet (`no_show`) | | | | egne, fra starttid til 24 timer efter sluttid. Derefter er bookingen automatisk gennemført | |
| Beskedtråd pr. lead | | | egne leads (fra afsendelse, så længe leadet er aktivt) | egne leads (fra afsendelse, så længe leadet er aktivt) | nej |
| Skrive anmeldelse | | | kun efter **gennemført booking** hos en verificeret klinik | | |
| Svare offentligt på anmeldelse | | | | anmeldelser af egen klinik | |
| Redigere profil, prisliste, åbningstider, blokeringer, tandlæger, portefølje, Trustpilot | | | egen patientprofil | egen klinik | |
| Trække samtykke tilbage, slette egne data, eksportere data | | ja | ja | | |
| Moderere anmeldelser og svar, ændre klinikstatus | | | | | ja (UI [IKKE BYGGET]) |

Bemærkninger:
- En anonym session kan aldrig blive klinik eller admin. Klinikker opretter sig via `/opret/klinik`.
- Admin har bevidst **ikke** adgang til sager, chat, billeder, leads, bookinger eller beskeder (dataminimering).

---

## 4. Datamodel

Status: bygget i det samlede migrationssæt (trin 0, se 11).

Alle tabeller ligger i `public`, har `id uuid primary key default gen_random_uuid()` (medmindre andet står), `created_at timestamptz not null default now()`, og **RLS er slået til på alle tabeller**. Enums er Postgres-enums. Det hele oprettes af det samlede migrationssæt (11).

### 4.1 Relationsoverblik

```
auth.users 1─1 profiles 1─1 patients
                        1─0..1 clinics (owner_id; importerede klinikker har ingen ejer)

profiles 1─n terms_acceptances                        (vilkårs-accept; IKKE samtykke)
patients 1─n consents                                 (GDPR art. 9-samtykker)

service_groups 1─n services                           (katalog: kategorier og behandlinger)
clinics n─n service_groups via clinic_service_groups  (klinikkens valgte kategorier)
clinics 1─n clinic_prices n─1 services                (prisliste: interval + varighed)
        1─n clinic_opening_hours                      (ugeskema, evt. akutvinduer)
        1─n clinic_time_blocks                        (lukket/ferie)
        1─n clinic_dentists 1─n portfolio_items       (kun visning; offentlig bucket)

patients 1─n cases 1─0..1 ai_conversations 1─n ai_messages   (kun patienten)
                   1─n case_services n─1 services            (bekræftede ydelser)
                   1─n case_images (n─1 consents)
                   1─n leads (max 3) n─1 clinics             (UNIQUE case_id + clinic_id)
leads 1─n messages                                    (tråd = ét lead = én patient + én klinik)
leads 1─n bookings (max 1 aktiv) n─1 services
bookings 1─0..1 reviews 1─0..1 review_replies

postal_codes (opslag: postnummer → by, lat, lng)
```

Anonyme patienter bruger de samme tabeller. Forskellen ligger i `profiles.is_anonymous` og i RLS/API-regler (5.1, 7.7).

### 4.2 Enums

```sql
user_role            = 'patient' | 'clinic' | 'admin'
clinic_status        = 'imported' | 'registered' | 'verified' | 'removed'
                       -- 'removed': selvoprettet klinik, hvis konto er slettet. Endelig; sættes kun af clinics_guard() (5.3)
service_category     = 'cosmetic' | 'general' | 'emergency'
case_status          = 'draft' | 'submitted' | 'closed'
case_timeframe       = 'asap' | 'within_2_weeks' | 'within_3_months' | 'flexible'
lead_status          = 'sent' | 'accepted' | 'declined' | 'booked' | 'withdrawn'
lead_decline_reason  = 'no_capacity' | 'not_offered' | 'needs_referral' | 'other' | 'clinic_left'
                       -- 'clinic_left' sættes kun af systemet, når en klinik sletter sin konto; ikke valgbar for klinikken
booking_status       = 'held' | 'booked' | 'completed' | 'no_show' | 'cancelled'
booking_actor        = 'patient' | 'clinic'
consent_type         = 'health_data_sharing' | 'image_upload' | 'ai_processing'
conversation_status  = 'active' | 'closed'
ai_message_role      = 'user' | 'assistant'
out_of_scope_topic   = 'price' | 'clinic_recommendation'
image_view           = 'front' | 'upper' | 'lower' | 'side_left' | 'side_right' | 'unclear'
image_quality        = 'ok' | 'too_dark' | 'blurry' | 'wrong_angle' | 'not_teeth'
price_accuracy       = 'as_quoted' | 'slightly_higher' | 'much_higher'   -- ja / lidt højere / langt højere
moderation_status    = 'pending' | 'approved' | 'rejected'
```

Danske visningsnavne står i `lib/constants/<domæne>.ts`.

**Livscyklusser** (håndhæves af triggers og funktionerne i 5.3, aldrig af klienten):
- `case_status`: `draft → submitted` (første lead sendt; indhold låses); `draft | submitted → closed` (patienten lukker med `close_case()`). Kun `draft` kan redigeres. En lukket sag kan ikke få nye leads; patienten kan altid starte en ny sag.
- `lead_status`: `sent → accepted | declined` (klinikken, `clinic_decide_lead()`) eller `sent → withdrawn` (patienten, `withdraw_lead()`); `accepted → booked` (booking oprettet); `booked → accepted` (booking aflyst). Systemovergange: `sent | accepted` (uden booking) `→ withdrawn` ved `close_case()` og ved tilbagetrækning af `health_data_sharing`; `sent | accepted → declined` med grunden `clinic_left`, når klinikken sletter sin konto. `declined` og `withdrawn` er endelige. **Aktive leads** = `sent`, `accepted`, `booked`. To lofter pr. sag: højst **3 aktive** leads og højst **10 leads i alt** uanset status. Patienten kan altid starte en ny sag.
- `booking_status`: `held` (kun akut: tiden er reserveret, mens leadet venter) `→ booked` (klinikken accepterer, før reservationen er udløbet) eller `→ cancelled` (klinikken afviser, patienten trækker leadet tilbage, eller reservationen udløber). En reservation udløber ved `hold_expires_at = least(created_at + 30 min, starts_at)`. `booked → cancelled` (patient eller klinik, før starttid; systemet for fremtidige bookinger, når klinikken sletter sin konto), `booked → no_show` (klinikken, fra starttid til 24 timer efter sluttid), ellers `booked → completed` automatisk, når 24-timers-fristen er udløbet. `completed`, `no_show` og `cancelled` er endelige.
- **Effektiv status:** en booking med `status = 'booked'` og `ends_at + interval '24 hours' <= now()` **er** gennemført, også før rækken er opdateret. Mellem sluttid og fristens udløb er den stadig `booked`. En `held`-booking med `hold_expires_at <= now()` er frigivet (`cancelled`). Alle policies og læsefunktioner bruger `effective_booking_status()` (5.2), så korrektheden ikke afhænger af et planlagt job. Jobbet `complete_due_bookings()` skriver blot den effektive status ned (5.3). Fristerne står som konstanter i `lib/constants/bookings.ts` og som de samme tal i migrationen; de skal ændres begge steder samtidig (oversigt i 7.6).
- **Hele kvarterer:** en booking skal starte på minut 0, 15, 30 eller 45 med sekunder 0 (check constraint på `bookings.starts_at` i lokal tid og tjek i `assert_slot_bookable()`). `SLOT_STEP_MINUTES = 15`.

### 4.3 Tabeller

#### `profiles`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK, FK auth.users on delete cascade | |
| role | user_role not null | Sættes af signup-triggeren ud fra metadata; kun `patient`/`clinic` accepteres. Anonyme får `patient` |
| is_anonymous | boolean not null | Spejl af `auth.users.is_anonymous`, holdt opdateret af trigger |
| last_active_at | timestamptz not null default now() | Opdateres via `touch_last_active()` for anonyme. Grundlag for udløb (7.7) |

#### `patients`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK, FK profiles on delete cascade | Oprettes af signup-triggeren, også for anonyme |
| first_name | text null | `null` for anonyme. Påkrævet ved signup og konvertering (1-50 tegn). Vises **ikke** for klinikker uden booking |
| phone | text null | Indsamles første gang ved booking og foreslås ved næste. Dansk format, valideres i API. Når klinikken kun via bookingens kontaktfelter (4.4) |
| postal_code | text null | Default for nye sager og for afstand i oversigten |

#### Signup-triggeren `handle_new_user()`
Rækkerne oprettes af triggeren på `auth.users` (security definer), ikke af API'et. API'et validerer input med zod og sender det som signup-metadata:

| Rolle | Metadata | Opretter |
|---|---|---|
| anonym | (ingen) | `profiles(role='patient', is_anonymous=true)` + `patients(first_name=null)` |
| patient | `role`, `first_name` | `profiles(role='patient')` + `patients(first_name)` |
| klinik | `role`, `cvr`, `clinic_name`, `address`, `postal_code`, `city`, `phone` | `profiles(role='clinic')` + `clinics(owner_id, status='registered', …)`. Findes en importeret klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE, 12.1]; klinikken bliver `registered` og dermed usynlig offentligt, indtil ejeren er verificeret. Har klinikken med CVR'et allerede en ejer, kaster triggeren `CLINIC_EXISTS` |

Ukendt rolle eller ugyldige metadata får signup til at fejle i databasen. GoTrue oversætter fejl fra triggeren til en generisk fejl, så API'et **forhåndstjekker CVR'et** med `is_cvr_claimed(p_cvr)` (5.3) og svarer selv 409 `CLINIC_EXISTS`, før signup kaldes. Triggerens tjek er det sidste værn.

#### `terms_acceptances`
Uændret: `user_id` (FK profiles cascade), `terms_version`, `privacy_version`, `accepted_at`, `created_at`. `unique (user_id, terms_version, privacy_version)`. Rækker ændres og slettes aldrig af brugeren.

#### `consents`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| patient_id | uuid FK patients on delete cascade | |
| type | consent_type | |
| text_version | text not null | Skal findes i `consent_text_versions` (trigger). Teksten ligger i `lib/constants/consents.ts` |
| granted_at | timestamptz not null default now() | Sættes server-side |
| granted_while_anonymous | boolean not null default false | |
| withdrawn_at | timestamptz null | |
| pending_storage_paths | text[] null | Filer, der skal slettes efter tilbagetrækning (`withdraw_consent()`) |
| cleanup_done | boolean not null default true | `false` indtil `confirm_consent_cleanup()` |

"Aktivt samtykke" = seneste række af typen med `withdrawn_at is null`.

| Samtykketype | Kræves før | Anonymt? | Dækker |
|---|---|---|---|
| `ai_processing` | Anonym session, chat og AI-opsummering | ja | Behandling af chat, tekst og billeder hos OpenAI og opbevaring i 48 timer, hvis der ikke oprettes konto |
| `image_upload` | Upload af billeder | ja | Opbevaring af mundfotos og deling med de klinikker, patienten senere sender sagen til |
| `health_data_sharing` | Afsendelse af leads | **nej**, kun med konto | Deling af godkendt opsummering, bekræftede ydelser, ønsket tidsrum, område og billeder med de op til 3 klinikker, patienten vælger. Teksten nævner også, at navn og kontaktoplysninger deles med klinikken ved booking |

#### `consent_text_versions`, `postal_codes` og tællere
- `consent_text_versions` (`type`, `text_version`, `ai_disclosure`): kendte samtykketekster. Offentligt læsbar.
- `postal_codes` (`postal_code text PK, city, lat, lng`): offentligt opslag. Seedes af `supabase/seed.sql`.
- `ai_limits`, `ai_usage_daily`, `ai_patient_usage_daily`, `ai_anon_user_usage_daily`, `rate_limits`: ingen brugeradgang; kun funktioner og service role (7.6). Indhold: lofter som nøgle/værdi (bl.a. `anon_daily_ai_calls`, `anon_user_daily_ai_calls`, `chat_messages_per_patient_day`), daglig tæller for alle anonyme AI-kald (ingen persondata), AI-kald pr. anonym bruger pr. døgn, udkast pr. patient pr. døgn, forsøg pr. bucket og IP-hash.

#### Behandlingskataloget: to niveauer

Kataloget har to niveauer: **kategorier** (`service_groups`, fx "Rodbehandling", "Implantater") og **behandlinger** (`services`), som hver hører til præcis én kategori. Derudover har hver behandling den overordnede **type** `services.category` (`general` / `cosmetic` / `emergency`), som akutlogik, akutfiltre og "kosmetisk eller almindelig" bruger. Kategori og type er uafhængige felter; reglen er, at alle behandlinger i kategorien `akut` har typen `emergency`, og ingen andre har det (check i migrationen via trigger).

Startindholdet (14 kategorier, 53 behandlinger: de 14 oprindelige slugs og 39 nye) står i bilaget `docs/behandlingskatalog.md`. **Kataloget vedligeholdes i databasen uden kodeændringer:** admin tilføjer, omdøber, omsorterer eller deaktiverer kategorier og behandlinger direkte (Supabase-dashboard eller script med service role; adminside [UDSKUDT]). Rækker slettes aldrig, fordi priser, sager og bookinger peger på dem; de deaktiveres med `is_active = false`. Koden må ikke afhænge af andre slugs end dem i `lib/constants/services.ts` (`EXAMINATION_SERVICE_SLUG = 'undersoegelse'`), og ingen kategori-slugs hardcodes.

#### `service_groups` (kategorier)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| slug | text not null unique | check `^[a-z0-9_]{2,60}$`. Stabil nøgle, fx `rodbehandlinger` |
| name | text not null | Dansk navn, 1-80 tegn |
| description | text not null | Kort, neutral forklaring, 1-500 tegn |
| sort_order | smallint not null default 0 | |
| is_active | boolean not null default true | En inaktiv kategori skjuler alle dens behandlinger for patienter og klinikker |

#### `services` (behandlinger)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| slug | text not null unique | Stabil nøgle, fx `undersoegelse`, `blegning`, `akut_konsultation`. Bruges af AI'en og i URL-filtre |
| group_id | uuid not null FK service_groups | Kategorien |
| name | text not null | Dansk navn |
| description | text not null | Kort, neutral forklaring til patienten. Må bruges af AI'en, når den forklarer behandlinger |
| category | service_category not null | Overordnet type: almindelig, kosmetisk eller akut |
| default_duration_min | smallint not null | Bruges, hvis klinikken ikke har angivet varighed. check 5-480 |
| sort_order | smallint not null default 0 | Inden for kategorien |
| is_active | boolean not null default true | Inaktive behandlinger (eller behandlinger i en inaktiv kategori) kan ikke vælges, prissættes eller foreslås. Eksisterende priser på dem vises ikke offentligt |

Kataloget skal mindst indeholde `undersoegelse` (bruges, når patienten er usikker, 7.3) og én aktiv behandling af typen `emergency` (akutvejen). Kun admin/migration skriver.

#### `clinic_service_groups` (klinikkens valgte kategorier)
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid FK clinics on delete cascade | PK sammen med group_id |
| group_id | uuid FK service_groups | Skal være aktiv ved valg |
| created_at | timestamptz | |

Klinikken vælger først de kategorier, den arbejder med, og prissætter derefter behandlinger i dem. Valget gemmes eksplicit (ikke udledt af priserne), så en klinik kan have valgt en kategori uden at have prissat den endnu, og så prislistens UI kan vise de valgte kategorier. Reglen håndhæves i databasen: en række i `clinic_prices` kræver, at behandlingens kategori er valgt af klinikken (trigger på `clinic_prices`). Fravalg af en kategori sletter klinikkens priser i den (i samme transaktion, `set_clinic_service_groups()`, 5.3). Valget er ikke offentligt; offentligheden ser kun priserne. Prisforslag til klinikken er [UDSKUDT] (12.4); klinikken skriver selv prisen.

#### `clinics`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid FK profiles on delete set null, **unique**, null | Kontoen. `null` for importerede klinikker. Når ejeren slettes, kører triggeren `clinics_after_owner_removed()` (5.3): en importeret klinik går tilbage til `imported` med bevarede grunddata; en klinik, der oprettede sig selv (`import_source is null`), bliver `removed` (skjult, rækken bevares). Rækker slettes aldrig |
| status | clinic_status not null | Se 3. Se også `clinic_import_snapshots` nedenfor. Ændres kun af admin/service role eller af `clinics_guard()`, når ejeren fjernes. Check `clinics_status_owner_check`: `status in ('imported', 'removed') or owner_id is not null`, dvs. `registered` og `verified` har altid en ejer, og `removed` har ingen |
| cvr | text null, unique | check `^[0-9]{8}$`. Kan ikke ændres af klinikken. Nulstilles, når klinikken bliver `removed`, så virksomheden kan oprette sig igen som en ny klinik med samme CVR |
| name | text not null | |
| description | text null | max 1000 tegn |
| address, postal_code, city | text not null | Offentlige erhvervsoplysninger |
| lat, lng | double precision null | Fra import eller `postal_codes`. Præcis geokodning [ÅBEN] |
| phone, email, website | text null | Offentlig kontakt. `website` har check `website ~ '^https?://'`; vises som link med `rel="noopener noreferrer nofollow ugc"` og `target="_blank"` |
| logo_path | text null | Bucket `public-media` (9.5) |
| logo_updated_at | timestamptz null | Sættes, når logoet uploades; bruges som `?v=` i logoets URL (9.5) |
| trustpilot_url | text null | Skal starte med `https://dk.trustpilot.com/` eller `https://www.trustpilot.com/` |
| trustpilot_score | numeric(2,1) null | 1.0-5.0, manuelt indtastet af klinikken |
| trustpilot_review_count | integer null | Manuelt |
| trustpilot_updated_at | timestamptz null | Sættes af trigger, når score ændres |
| trustpilot_entered_by | text null | `clinic` eller `admin`. For importerede klinikker indtastes Trustpilot-data manuelt af TandMatch (admin/seed) i prototypen (aldrig scraping; rigtig løsning [UDSKUDT], 12.4); bestemmer mærkaten "angivet af klinikken" / "angivet af TandMatch" (8.4) |
| import_source | text null | Fx `cvr`, `seed`. Kun admin/service role |
| verified_at | timestamptz null | Sættes af `admin_set_clinic_status()` |
| owner_since | timestamptz null | Sættes til `now()` af trigger, når `owner_id` sættes (signup eller CVR-overtagelse), og nulstilles, når ejeren fjernes. Klinikken ser kun leads med `sent_at >= owner_since` og de tilhørende beskeder, bookinger og anmeldelser, så en ny ejer aldrig ser en tidligere ejers data. Kan ikke ændres af klinikken |
| updated_at | timestamptz | |

`clinics_guard()` (BEFORE INSERT/UPDATE) afviser, at ikke-admins ændrer `owner_id`, `owner_since`, `status`, `cvr`, `import_source` og `verified_at`, sætter `owner_since` ud fra `owner_id`, sætter `trustpilot_entered_by = 'clinic'`, når klinikken selv ændrer Trustpilot-felterne, og afviser enhver ændring af en `removed` klinik (`CLINIC_REMOVED`). Når `owner_id` bliver `null` (ejerens konto slettet), ændrer guarden selve klinikrækken: en importeret klinik bliver `imported` (`verified_at` nulstilles); en selvoprettet klinik (`import_source is null`) bliver `removed` med `cvr`, `verified_at`, `phone`, `description`, `email`, `website`, `logo_path`, `logo_updated_at` og klinikindtastet Trustpilot nulstillet; navn, adresse, postnummer, by, koordinater og admin-indtastet Trustpilot bevares. Rækker i andre tabeller ryddes bagefter af `clinics_after_owner_removed()` (5.3).

#### `clinic_import_snapshots`
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid PK, FK clinics on delete cascade | En række pr. overtaget importeret klinik |
| name, address, postal_code, city, phone | text | Grunddata, som de var før overtagelsen |
| lat, lng | double precision null | |
| opening_hours | jsonb | Åbningsvinduerne før overtagelsen |
| created_at | timestamptz | |

RLS er slået til uden policies; `anon` og `authenticated` har ingen rettigheder. `handle_new_user()` gemmer snapshottet, når en importeret klinik overtages via CVR. Når ejeren fjernes fra en importeret klinik, der **ikke** er verificeret, gendanner `clinics_guard()` grunddata og `clinics_after_owner_removed()` åbningstiderne fra snapshottet, så en uverificeret ejer aldrig kan efterlade ændrede offentlige data. Har ejeren været verificeret, bevares ejerens ændringer. Snapshottet slettes altid, når ejeren fjernes. Klinikker, der blev overtaget før migrationen `20261016000100_clinic_import_snapshot.sql`, har intet snapshot (12.1). Trustpilot hentes aldrig automatisk.

#### `clinic_prices` (prisliste)
| Felt | Type | Note |
|---|---|---|
| clinic_id | uuid FK clinics on delete cascade | PK sammen med service_id |
| service_id | uuid FK services | |
| price_min, price_max | integer not null | check `0 <= price_min <= price_max` |
| duration_min | smallint not null | check 5-480. Bruges til ledige tider (6.7) |
| note | text null | max 200, fx "inkl. 2 røntgenbilleder" |
| updated_at | timestamptz | |

#### `clinic_opening_hours`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| weekday | smallint not null | ISO: 1 = mandag … 7 = søndag |
| opens_at, closes_at | time not null | Lokal tid. check `opens_at < closes_at`. Flere rækker pr. dag tilladt (fx frokostlukket) |
| is_emergency | boolean not null default false | **Akutvindue:** tider her kan kun bookes til akutydelser. Akutydelser kan også bookes i almindelige vinduer |

Overlappende vinduer samme dag afvises (trigger). Importerede klinikker kan have åbningstider fra importen.

#### `clinic_time_blocks`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| starts_at, ends_at | timestamptz not null | check `starts_at < ends_at`. Lukket, ferie, fuldt booket via eget system |
| note | text null | Kun synlig for klinikken |

#### `clinic_dentists` (kun visning)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | |
| full_name | text not null | |
| title | text null | Fx "Tandlæge", "Specialtandlæge i ortodonti" |
| bio | text null | max 1000 |
| photo_path | text null | Bucket `public-media` |
| photo_updated_at | timestamptz null | Sættes, når portrættet uploades; bruges som `?v=` i portrættets URL (9.5). Migration `20261013000100_dentist_photo_version.sql` |
| sort_order | smallint not null default 0 | |

Tandlæger har intet login og ingen rolle. Leads og bookinger går til klinikken.

#### `portfolio_items`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| clinic_id | uuid FK clinics on delete cascade | Redundant, for enkel RLS |
| dentist_id | uuid FK clinic_dentists on delete cascade | Skal tilhøre samme klinik (trigger) |
| service_id | uuid FK services null | Hvilken behandling billedet viser |
| image_path | text not null unique | Bucket `public-media` (9.5) |
| caption | text null | max 200. Ingen personoplysninger |
| patient_consent_confirmed_at | timestamptz not null | Klinikken bekræfter, at patienten på billedet har givet samtykke til offentliggørelse. Sættes server-side ved upload |
| consent_text_version | text not null | Den bekræftelsestekst, klinikken accepterede (`lib/constants/consents.ts`, `PORTFOLIO_CONSENT_TEXT_VERSION`). Valideres af serveren mod konstanten, ikke mod `consent_text_versions` (9.5) |

Vises kun for verificerede klinikker.

#### `cases` (sag)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| patient_id | uuid FK patients on delete cascade | |
| status | case_status not null default 'draft' | |
| is_emergency | boolean not null default false | Sat for sager oprettet via akutvejen (6.1) |
| postal_code | text null | Område for afstand. Præcis adresse gemmes ikke |
| preferred_timeframe | case_timeframe null | Ønsket tidsrum. Påkrævet før afsendelse |
| ai_summary | jsonb null | Senest validerede AI-udkast (`AiSummary`, 7.4). Kun via `store_ai_summary()` |
| ai_model, ai_prompt_version | text null | Sporbarhed |
| ai_generation_count | integer not null default 0 | Max 5 udkast pr. sag (`consume_summary_generation()`) |
| summary_text | text null | Den opsummering, patienten har **godkendt** (max 1500). Det er den, klinikken ser. Kun via `approve_summary()` |
| summary_ai_assisted | boolean not null default false | Vises for klinikken |
| summary_approved_at | timestamptz null | Nulstilles af trigger, når billeder ændres efter godkendelse |
| sharing_consent_id | uuid FK consents null | Sættes ved første afsendelse |
| submitted_at, closed_at | timestamptz null | |
| updated_at | timestamptz | |

Redigerbarhed håndhæves i databasen: UPDATE-policyen kræver ejer og `status = 'draft'`, og triggeren `cases_guard` afviser ændringer af beskyttede felter (status, AI-felter, tællere, `summary_text`, `submitted_at`) uden for funktionerne i 5.3. En anonym patient kan højst have én `draft` (trigger).

#### `case_services` (bekræftede ydelser)
| Felt | Type | Note |
|---|---|---|
| case_id | uuid FK cases on delete cascade | PK sammen med service_id |
| service_id | uuid FK services | Skal være aktiv |
| suggested_by_ai | boolean not null default false | Om ydelsen kom fra AI'ens forslag (sporbarhed) |
| confirmed_at | timestamptz not null default now() | |

Kun rækker, patienten har bekræftet, findes her. AI'ens forslag ligger på `ai_messages.suggested_service_ids` og `cases.ai_summary`. Max 5 ydelser pr. sag. Kan kun ændres, mens sagen er `draft`.

#### `ai_conversations`
Som før, men bundet til sagen: `case_id` (FK cases cascade, **unique**), `patient_id`, `status` (`active`/`closed`), `user_message_count` (kun trigger), `ai_consent_id` (FK consents not null), `prompt_version`, `model`. Lukkes, når sagen sendes.

#### `ai_messages`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK ai_conversations on delete cascade | |
| patient_id | uuid FK patients on delete cascade | Redundant, for enkel RLS |
| role | ai_message_role not null | Patienten kan kun indsætte `user`. `assistant` kun via `append_assistant_message()` (service role) |
| content | text not null | Bruger: max 1000 tegn (PII-maskeret). Assistent: det validerede svar eller den faste afvisningstekst |
| preliminary_assessment | text null | Kun assistent. Foreløbig vurdering, vises altid med fast mærkat (7.3) |
| suggested_service_ids | uuid[] not null default '{}' | Kun assistent. Validerede id'er fra kataloget |
| emergency | boolean not null default false | Kun assistent. Akutte tegn; UI viser fast akut-henvisning |
| out_of_scope | out_of_scope_topic[] not null default '{}' | Kun assistent |
| blocked | boolean not null default false | Svaret blev afvist af filteret og erstattet |
| ready_for_summary | boolean not null default false | Aktiverer kun knappen "Lav opsummering" |

Chatten deles **aldrig** med klinikker. Triggeren `ai_messages_after_insert()` tæller brugerbeskeder og lukker samtalen ved 30.

#### `case_images`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| case_id | uuid FK cases on delete cascade | |
| patient_id | uuid FK patients | Redundant, for enkel RLS |
| consent_id | uuid FK consents not null | Det `image_upload`-samtykke, der var aktivt ved upload |
| storage_path | text not null unique | `{case_id}/{id}.jpg`. Ingen `patient_id` i stien |
| ai_view, ai_quality | image_view / image_quality null | Fra AI |
| ai_description | text null | Neutral beskrivelse (7.3), højst 500 tegn (`imageDescription()` i `lib/domain/summary.ts` afkorter til `IMAGE_DESCRIPTION_MAX_CHARS` før gemning), godkendes som del af opsummeringen. Deles kun med klinikken, når patienten har godkendt opsummeringen **efter** beskrivelsen blev skrevet: `clinic_lead_images()` returnerer den i kolonnen `approved_description`, når `cases.summary_approved_at >= ai_described_at`, ellers er `approved_description` `null` (fail closed; migration `20261019000200`). Klinikkens visning (trin 4-5) skal tåle `null` |
| ai_described_at | timestamptz null | Sættes af trigger, når `ai_description` skrives eller ændres |
| width, height, bytes | integer | |
| created_at | timestamptz | Upload-tidspunkt under `consent_id` |

Max 5 billeder pr. sag; kun mens sagen er `draft`. Skrives og slettes kun med service role (9.3).

#### `leads`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| case_id | uuid FK cases on delete cascade | **UNIQUE (case_id, clinic_id)** |
| clinic_id | uuid FK clinics | Skal være `verified` ved afsendelse |
| status | lead_status not null default 'sent' | |
| distance_km | numeric null | Snapshot ved afsendelse, til klinikkens visning |
| list_price_min, list_price_max | integer null | Snapshot af klinikkens listepris for sagens bekræftede ydelser (sum), som patienten så ved afsendelse. `null` hvis en ydelse mangler i prislisten. Er prisoverslaget i anmeldelsen, hvis klinikken ikke angiver en præciseret pris (8.2) |
| requested_service_id | uuid FK services null | Kun akutvejen: den ønskede akutydelse |
| requested_starts_at | timestamptz null | Kun akutvejen: den tid, patienten har valgt. Reserveres straks som en `held`-booking i højst 30 minutter (eller til starttid, hvis den kommer før) og bliver `booked` ved accept (6.1) |
| seen_at | timestamptz null | Første gang klinikken åbner leadet |
| responded_at | timestamptz null | |
| clinic_comment | text null | "Accepter med kommentar", max 500 |
| quoted_price_min, quoted_price_max | integer null | Valgfri præciseret pris ved accept. check `0 <= min <= max` |
| decline_reason | lead_decline_reason null | Påkrævet ved afvisning |
| decline_note | text null | max 200 |
| sent_at | timestamptz not null default now() | |
| withdrawn_at | timestamptz null | Sat af `withdraw_lead()` |

Rækker oprettes **kun** af `send_leads()` og ændres kun af `clinic_decide_lead()`, `withdraw_lead()` og booking-funktionerne (5.3). Maks. 3 **aktive** leads pr. sag (`sent`, `accepted`, `booked`) og maks. **10 leads i alt** pr. sag uanset status (trigger og funktion); afviste og tilbagetrukne tæller ikke i de 3, så patienten kan vælge en ny klinik, men tæller i de 10. Samme klinik kan ikke få sagen igen (`UNIQUE (case_id, clinic_id)`). Leads udløber ikke; et ubesvaret lead kan patienten trække tilbage. Efter tilbagetrækning ser klinikken kun, at leadet er trukket tilbage, ikke sagens indhold (5.7).

#### `messages` (beskedtråd pr. lead)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK leads on delete cascade | Tråden er én patient og én klinik |
| sender_id | uuid null FK profiles `on delete set null` | Afsenderen. Slettes klinikkontoen, bevares beskeden i patientens tråd uden afsender (besluttet, 12.3 punkt 30; migration i 5.2) |
| sender_role | `message_sender_role` (`patient` \| `clinic`) not null | Sættes af serveren/funktionen ved indsættelse og afgør `fromMe` og visningen ("Klinikken"), også når `sender_id` er null |
| body | text not null | max 2000 tegn |
| read_at | timestamptz null | |

Tråden er åben, mens leadet er aktivt (`sent`, `accepted`, `booked`), så klinikken kan stille et afklarende spørgsmål før accept. Ved `declined` og `withdrawn` er den lukket for nye beskeder; eksisterende beskeder kan stadig læses af begge, undtagen at klinikken mister adgangen ved `withdrawn` (5.7). Kontakt går gennem tråden; platformen fjerner ikke kontaktoplysninger, som patienten selv skriver, men patientens profiloplysninger deles ikke før booking.

#### `bookings`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK leads on delete cascade | Leadet skal være `accepted` ved oprettelse (akut: `sent`, som `held`) |
| clinic_id | uuid FK clinics | Fra leadet (trigger) |
| patient_id | uuid FK patients on delete cascade | Fra sagen (trigger). Når **aldrig** klinikken |
| service_id | uuid FK services | En af sagens bekræftede ydelser (eller den ønskede akutydelse) |
| starts_at, ends_at | timestamptz not null | `ends_at = starts_at + varighed` (klinikkens `duration_min`, ellers `default_duration_min`). Beregnes i `book_slot()` |
| status | booking_status not null default 'booked' | Læses altid som effektiv status (4.2) |
| contact_name | text not null | Patientens fulde navn, indtastet ved booking eller ved afsendelse af akut-lead (2-100 tegn) |
| contact_phone | text not null | Indtastet samme sted; gemmes også i `patients.phone` |
| contact_email | text not null | Fra kontoen (`auth.users.email`), sat af funktionen |
| cancelled_by | booking_actor null | |
| cancelled_at | timestamptz null | |
| hold_expires_at | timestamptz null | Kun `held`: `least(created_at + interval '30 minutes', starts_at)`. Sættes af `send_leads()`; check `status <> 'held' or hold_expires_at is not null` |
| no_show_at | timestamptz null | Sat af `mark_booking_no_show()` |
| completed_at | timestamptz null | Sat af `complete_due_bookings()` (= `ends_at + 24 timer`, når fristen for udeblivelse udløb) |

Regler i databasen:
- **Ingen dobbeltbooking:** `exclude using gist (clinic_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status in ('held', 'booked', 'completed'))`. En reserveret akuttid kan derfor ikke tages af andre. Én kalender pr. klinik [PROTOTYPE].
- **Udløb af reservationer uden cronjob:** en exclusion constraint kan ikke bruge `now()`. Derfor kalder alle funktioner, der opretter eller ændrer en booking (`book_slot()`, `send_leads()`, `clinic_decide_lead()`), først den interne `release_expired_holds(clinic_id)` i samme transaktion. Den sætter `held`-rækker for klinikken med `hold_expires_at <= now()` til `cancelled` (`cancelled_by = null`, `cancelled_at = hold_expires_at`). En udløbet reservation blokerer dermed aldrig en ny booking. Læsning (`effective_booking_status()`, `public_busy_intervals()`) behandler den som frigivet, også før den er skrevet ned.
- Højst én aktiv booking pr. lead: unik delvis indeks på `lead_id` where `status in ('held', 'booked')`.
- Oprettes kun via `book_slot()` og `send_leads()` (akut, `held`); ændres kun via `clinic_decide_lead()`, `withdraw_lead()`, `cancel_booking()`, `mark_booking_no_show()`, `release_expired_holds()` og `complete_due_bookings()` (5.3). Tiden skal ligge i et åbningsvindue, uden for blokeringer, mindst `MIN_BOOKING_NOTICE_MIN` frem og højst `BOOKING_HORIZON_DAYS` frem (6.7).
- Klinikken markerer ikke gennemførte besøg; kun udeblivelse.

#### `reviews`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| booking_id | uuid FK bookings **unique** | Én anmeldelse pr. gennemført booking |
| clinic_id | uuid FK clinics | Fra bookingen (trigger) |
| patient_id | uuid FK patients on delete cascade | |
| stars | smallint not null | 1-5 |
| text | text not null | 20-2000 tegn |
| price_accuracy | price_accuracy not null | "Svarede den endelige pris til prisoverslaget?" |
| actual_price | integer null | Valgfri |
| lacked_transparency | boolean null | Valgfri |
| transparency_comment | text null | Valgfri, max 500 |
| moderation_status | moderation_status not null default 'pending' | Tvinges til `pending` ved insert |
| moderated_by, moderated_at, rejection_reason | | Admin |

Offentligt vises anmelderen kun som "Verificeret besøg" + måned/år.

#### `review_replies`
`review_id` (FK reviews cascade, **unique**), `clinic_id` (skal være lig `reviews.clinic_id`), `text` (max 1000), moderationsfelter som `reviews`.

#### Anmeldelsesstatistik (funktion, ikke view)
`public_clinic_review_stats_many(clinic_ids)` beregner pr. klinik: `review_count`, `avg_stars` (1 decimal), fordeling `as_quoted`/`slightly_higher`/`much_higher` og `price_accuracy_pct` (8.3), de to sidste `null` ved under 3 anmeldelser. Kun godkendte anmeldelser og kun for **verificerede** klinikker; andre får ingen række.

### 4.4 Hvad klinikken ser om patienten

| Tidspunkt | Klinikken ser | Klinikken ser aldrig |
|---|---|---|
| Lead `sent`/`accepted`/`declined` (og en `held` akuttid) | Bekræftede ydelser, godkendt opsummering (`summary_text`, `summary_ai_assisted`), godkendte billedbeskrivelser, billeder (kun med aktivt `image_upload`-samtykke), ønsket tidsrum, område (postnummer og by), afstand, listepris-snapshot, akutmarkering og ønsket akuttid | Navn, e-mail, telefon, `patient_id`, AI-chatten, andre klinikkers leads, om sagen er sendt til andre |
| Booking `booked` eller `completed` (effektiv status) | Det samme plus `contact_name`, `contact_phone` og `contact_email` **for den booking** | `patient_id`, AI-chatten |
| Booking `cancelled` eller `no_show` | Kontaktfelterne skjules igen | |
| Lead `withdrawn` | Kun at leadet er trukket tilbage, og hvornår | Alt sagsindhold, billeder og beskeder |

Klinikker har ingen SELECT-adgang til `cases`, `case_services`, `case_images`, `bookings`, `patients` eller `ai_*`. De læser kun via `clinic_*`-funktionerne (5.7), som aldrig returnerer `patient_id` og kun returnerer kontaktfelterne, når bookingens status er `booked` eller `completed`. Klinikker har heller ingen direkte SELECT på `leads` (migration `20261024000100`); status for et lead slås op med `clinic_lead_status()`.

**Accepteret i prototypen (security trin 5, M1):** den signerede billed-URL indeholder stien `{case_id}/{image_id}.jpg`, så to klinikker med samme sag i teorien kan se, at de har fået samme sag, ved at sammenligne URL'er. Ingen patientidentitet. Før rigtige patientdata: sti uden sags-id (9.2, ny migration).

---

## 5. Row Level Security

Status: bygget i migrationssættet og dækket af RLS-testene i `tests/rls/` (trin 0). Læsefunktionerne i 5.7 bruges af klinikkens leads-API og beskedtråd (10.9, 10.12; trin 5); `clinic_bookings()` og `clinic_reviews()` bruges fra trin 6.

### 5.1 Grundregler

1. RLS på **alle** tabeller. Ingen policy = ingen adgang.
2. API'et bruger brugerens JWT, så RLS gælder i alle normale flows.
3. Views oprettes med `security_invoker = true`.
4. Hjælpefunktioner, der krydser tabeller, er `security definer`, `stable`, har `set search_path = ''`, **returnerer kun boolean** og tager kun et id. **Undtagelser:** `auth_clinic_id()` returnerer den kaldendes egen kliniks id; `effective_booking_status()` returnerer en status; de interne beregningshjælpere `service_duration_min()` og `haversine_km()` returnerer tal; `participant_messages_last_day()` returnerer et heltal om egne rækker (`patient_user_messages_last_day()` er droppet; døgnloftet tælles i `ai_patient_usage_daily.chat_messages`). Læsefunktionerne `clinic_*` (5.7) og `public_*` (5.3) returnerer rækker og er bevidst eneste læsevej; de returnerer kun felterne i deres DTO.
5. Ingen bruger kan opdatere `role`, `is_anonymous`, `clinics.status`, `moderation_status`, statusfelter på sager, leads og bookinger eller kontaktfelter direkte. Det sker via triggers eller navngivne funktioner (5.3).
6. **Anonyme sessioner** er `authenticated`-brugere; ejer-regler virker uændret. `is_permanent_user()` spærrer alt ud over egen kladde: leads, delingssamtykke, booking, beskeder, anmeldelser.
7. **Service role** bruges kun til formålene i 2.3. AI-skrivefunktionerne og `try_consume_anonymous_ai_call()` har `revoke execute ... from public, anon, authenticated` og `grant execute ... to service_role`.
8. **Ingen `auth.uid()` i funktioner, der kun kaldes med service role.** Her er `auth.uid()` tom. Sådanne funktioner tager bruger-id'et som parameter og tjekker selv ejerskab og tilstand (fx `try_consume_anonymous_ai_call(p_user_id)`, `append_assistant_message(p_user_id, …)`).
9. **Låst opsummering.** `cases.summary_text` ændres kun via `approve_summary()`.
10. **Storage uden klientskrivning.** Hverken `authenticated` eller `anon` kan skrive, slette eller læse i `case-images`. Signerede URL'er laves af serveren med service role efter en RLS-beskyttet læsning af stien (9.2). `public-media` er offentlig læsbar; skrivning kun med service role (9.5).
11. **Offentlige klinikdata læses kun via `public_*`-funktioner.** Tabellerne `clinics`, `clinic_prices`, `clinic_opening_hours`, `clinic_dentists` og `portfolio_items` har ingen SELECT-policy for `anon` eller andre end ejeren. Så styrer funktionerne, hvilke klinikker der vises, og på hvilket niveau. **Synlighed (besluttet):** `public_*` returnerer kun klinikker med status `verified` (fuldt niveau) og klinikker med status `imported` og `owner_id is null` (basisniveau). En `registered` klinik er usynlig offentligt, indtil den er verificeret, også hvis den er en overtaget importeret klinik. `removed` vises aldrig.
12. **Kolonne-grants.** Hvor en ejer må opdatere en tabel, men kun nogle felter, begrænses `UPDATE` med kolonne-grants til `authenticated` (ud over policy og trigger):

| Tabel | `authenticated` må opdatere |
|---|---|
| `clinics` | `name`, `description`, `address`, `postal_code`, `city`, `phone`, `email`, `website`, `trustpilot_url`, `trustpilot_score`, `trustpilot_review_count`. `lat`/`lng` sættes af `clinics_guard()` ud fra postnummeret, og `logo_path` skrives af serveren med service role efter upload (9.5) |
| `patients` | `first_name`, `postal_code`, `phone` |
| `cases` | `postal_code`, `preferred_timeframe` |
| `portfolio_items` | `caption`, `service_id` (INSERT kun med service role; `image_path`, `clinic_id`, `dentist_id` og samtykkefelterne kan ikke ændres af klienten) |
| `clinic_dentists` | INSERT og UPDATE kun på `clinic_id`, `full_name`, `title`, `bio`, `sort_order`. `photo_path` og `photo_updated_at` skrives kun af serveren med service role efter upload (`setPhotoPath`, 2.3 d) |
| `messages` | `read_at` |

Alle andre kolonner skrives kun af triggers og funktionerne i 5.3.
13. **Interne funktioner** (`release_expired_holds`, `assert_slot_bookable`, `service_duration_min`, `haversine_km`, `effective_booking_status(uuid)`, triggerfunktioner) har ingen EXECUTE for `anon` og `authenticated`, medmindre de bruges i en policy (så gives kun `authenticated`). `effective_booking_status(uuid)` er ikke kaldbar af `authenticated`; policies bruger `can_review_booking()`.
14. **Tabelrettigheder:** `TRUNCATE`, `REFERENCES` og `TRIGGER` er revoket fra `anon` og `authenticated` på alle tabeller i `public`.
15. **Tidsstempler sættes af databasen:** en BEFORE INSERT-trigger på `ai_messages` og `messages` sætter `created_at = now()` og `read_at = null`, uanset hvad klienten sender.
16. **Ejerskab er tidsafgrænset:** klinikkens adgang til leads og alt, der hænger på dem (beskeder, bookinger, anmeldelser), kræver `leads.sent_at >= clinics.owner_since` og en verificeret klinik.

### 5.2 Hjælpefunktioner

```sql
auth_role()                           -> user_role
is_admin()                            -> boolean
is_permanent_user()                   -> boolean     -- JWT-claim is_anonymous = false
has_active_consent(type consent_type) -> boolean
auth_clinic_id()                      -> uuid        -- clinics.id hvor owner_id = auth.uid(), ellers null (undtagelse, 5.1 regel 4)
is_clinic_owner(clinic_id)            -> boolean
is_verified_clinic_owner()            -> boolean     -- kaldende ejer en klinik med status 'verified'
is_case_owner(case_id)                -> boolean
is_lead_participant(lead_id)          -> boolean     -- ejer af sagen ELLER ejer af leadets klinik, når klinikken er 'verified',
is_lead_patient(lead_id)              -> boolean     -- brugeren er patient på leadets sag (bruges i messages-policyerne)
is_my_clinic_lead(lead_id)            -> boolean     -- brugeren ejer leadets klinik, klinikken er 'verified', og sent_at >= owner_since
                                                     -- leadet ikke er 'withdrawn' og lead.sent_at >= clinics.owner_since
is_lead_thread_open(lead_id)          -> boolean     -- lead.status in ('sent','accepted','booked')
is_lead_active_status(status)         -> boolean     -- status in ('sent','accepted','booked'); bruges af loftet på 3 aktive
review_is_for_my_clinic(review_id)    -> boolean
can_review_booking(booking_id)        -> boolean     -- policy-hjælper: bookingen er egen, effektivt 'completed', klinikken
                                                     -- er verificeret (8.1). Ikke-anmeldt sikres af unique(booking_id)
review_is_approved(review_id)         -> boolean     -- policy-hjælper: bruges af review_replies INSERT
is_allowed_consent_text(type, version) -> boolean
participant_messages_last_day()       -> integer
```

Interne hjælpere (ikke RPC; kaldes kun af andre funktioner, triggers og policies):

```sql
effective_booking_status(booking_id uuid) -> booking_status   -- ikke kaldbar af anon/authenticated (5.1 regel 13)
      -- 'booked' og ends_at + 24 t <= now() → 'completed'; 'held' og hold_expires_at <= now() → 'cancelled'; ellers status
      -- (undtagelse fra 5.1 regel 4: returnerer en status). Eneste definition af "effektiv status" (4.2)
assert_slot_bookable(clinic_id, service_id, starts_at, ends_at) -> void   -- akut afgøres af ydelsen
      -- kaster fejl, hvis tiden ikke ligger på et helt kvarter, uden for åbningsvindue (akutvindue kun for akutydelser),
      -- i en blokering, før varsel eller efter horisont (6.7). Bruges af book_slot() og send_leads()
service_duration_min(clinic_id, service_id) -> integer
      -- clinic_prices.duration_min, ellers services.default_duration_min
haversine_km(lat1, lng1, lat2, lng2) -> numeric
      -- afstand til leads.distance_km og public_*-funktionerne
release_expired_holds(clinic_id) -> void   -- se 5.3
withdraw_open_leads(...) -> integer
      -- sætter leads med status 'sent', og 'accepted' uden aktiv booking, til 'withdrawn' og frigiver deres 'held'-reservationer;
      -- returnerer antal. Fælles for close_case() (én sag) og withdraw_consent() ved health_data_sharing (alle patientens sager)
```

### 5.3 Funktioner (RPC, `security definer`)

| Funktion | Kaldes af | Gør |
|---|---|---|
| `send_leads(case_id, clinic_ids uuid[], requested_service_id default null, requested_starts_at default null, contact_name default null, contact_phone default null)` | patient (permanent) | Tjekker ejer, `is_permanent_user()`, godkendt opsummering, mindst én bekræftet ydelse, `preferred_timeframe` sat (ikke ved akut), aktivt `health_data_sharing`, at alle klinikker er `verified`, at sagen ikke allerede har været sendt til klinikken, at **aktive** leads + nye ≤ 3 (ellers `LEAD_LIMIT`) og at **alle** leads på sagen + nye ≤ 10 (ellers `LEAD_TOTAL_LIMIT`). `requested_*` og `contact_*` kun ved én klinik og en akutydelse: så kaldes `release_expired_holds()`, tiden tjekkes som i `book_slot()`, og der oprettes i samme transaktion en `held`-booking med kontaktfelterne og `hold_expires_at = least(now() + 30 min, starts_at)` (overlap → 409 `SLOT_TAKEN`). Indsætter leads med `distance_km` og listepris-snapshot, sætter sagen `submitted` (første gang), `sharing_consent_id`, `submitted_at`, og lukker AI-samtalen. Returnerer kun antal oprettede leads |
| Trigger `leads_clinic_guard()` | BEFORE INSERT på `leads` (ikke en RPC) | Afviser et lead til en `removed` klinik (forsvar i dybden ud over `send_leads()`, som kun accepterer `verified`) |
| Trigger `leads_daily_limit()` | BEFORE INSERT på `leads` (ikke en RPC) | Højst 15 leads pr. patient på rullende 24 timer på tværs af sager og status (`LEAD_DAILY_LIMIT`, 429); advisory-lås pr. patient (7.6, migration `20261022000100`) |
| `patient_lead_clinics(p_case_id default null)` | patient | Navn, by, logo og `removed` for klinikker på egne leads (også `removed`, så uden logo). Ingen kontaktoplysninger, CVR eller adresse (10.9) |
| `clinic_decide_lead(lead_id, decision, comment, quoted_min, quoted_max, decline_reason, decline_note)` | klinik (verificeret ejer af leadets klinik) | Kun fra `sent`. `accept`: sætter `accepted`, kommentar og evt. pris; kalder først `release_expired_holds()`. Har leadet en `held`-booking, der ikke er udløbet (`hold_expires_at > now()`), bliver den `booked`, og leadet `booked`. Er reservationen udløbet, accepteres leadet alligevel (`accepted`) uden booking, og patienten booker selv en ledig tid via `book_slot()` (evt. den samme, hvis den stadig er ledig). `decline`: kræver `decline_reason` (ikke `clinic_left`, som kun systemet sætter); en `held`-booking sættes `cancelled` (`cancelled_by = 'clinic'`), så tiden frigives. Sætter `responded_at` |
| `close_case(p_case_id)` | patient (+anonym for kladde; ejer) | Fra `draft` eller `submitted`. Sætter `closed` og `closed_at`. Alle sagens leads med status `sent`, og `accepted` uden aktiv booking, sættes til `withdrawn` (`withdrawn_at = now()`), og deres `held`-reservationer frigives (`cancelled`, `cancelled_by = 'patient'`). Leads med `booked` og deres bookinger består. Lukker en evt. aktiv AI-samtale. Idempotent på en lukket sag |
| `set_clinic_service_groups(p_group_ids uuid[])` | klinik (ejer, permanent) | Erstatter klinikkens valgte kategorier i én transaktion. Kun aktive kategorier. Sletter klinikkens priser for behandlinger i kategorier, der fravælges. Returnerer de valgte kategori-id'er |
| `replace_clinic_prices(p_prices jsonb)` | klinik (ejer, permanent) | Erstatter hele prislisten i én transaktion (slet + indsæt). Validerer valgt kategori, aktiv behandling, pris- og varighedsgrænser og højst 100 rækker. En tom liste sletter alle priser |
| `replace_opening_hours(p_hours jsonb)` | klinik (ejer, permanent) | Erstatter alle åbningsvinduer i én transaktion. Højst 42 vinduer; overlap afvises af triggeren, og så rulles alt tilbage. En tom liste sletter alle vinduer |
| `is_cvr_claimed(p_cvr)` | `anon` og `authenticated` (signup-routen, før signup) | `true`, hvis en klinik med CVR'et har en ejer. Returnerer kun boolean (5.1 regel 4); afslører ikke andet. Rate-limit som signup |
| `withdraw_lead(lead_id)` | patient (permanent, ejer af sagen) | Kun fra `sent`. Sætter `withdrawn` og `withdrawn_at`; en `held`-booking sættes `cancelled` (`cancelled_by = 'patient'`). Pladsen i loftet på 3 aktive bliver fri (leadet tæller stadig i loftet på 10). Klinikken mister adgangen til sagens indhold og beskedtråden (5.7) |
| `clinic_mark_lead_seen(lead_id)` | klinik (ejer) | Sætter `seen_at`, hvis tom |
| `clinic_lead_status(p_lead_id)` | klinik (verificeret ejer, `sent_at >= owner_since`) | Returnerer leadets `lead_status` eller null (fremmed lead, ikke-verificeret klinik eller lead fra før `owner_since`). Erstatter klinikkens direkte læsning af `leads` (security trin 5, H1; migration `20261024000100`) |
| `clinic_lead_messages(p_lead_id)` | klinik (verificeret ejer; `is_lead_participant`) | Læsefunktion: trådens beskeder som `id`, `body`, `created_at`, `read_at`, `from_me`. Aldrig `sender_id` |
| `clinic_mark_messages_read(p_lead_id)` | klinik (verificeret ejer; `is_lead_participant`) | Sætter `read_at = now()` på patientens ulæste beskeder i tråden |
| `book_slot(lead_id, service_id, starts_at, contact_name, contact_phone)` | patient (permanent, ejer af sagen) | Leadet skal være `accepted` uden aktiv booking; ydelsen skal være bekræftet på sagen (eller leadets akutydelse). Beregner varighed (`service_duration_min()`) og `ends_at` og kalder `assert_slot_bookable()` (helt kvarter, åbningsvindue, akutvindue kun for akutydelser, blokeringer, varsel og horisont, 6.7). Sætter `contact_email` fra `auth.users`, gemmer telefon på `patients`. Kalder `release_expired_holds()` og indsætter derefter bookingen; overlap afvises af udelukkelsen (→ 409 `SLOT_TAKEN`). Afviser med `BOOKING_LIMIT`, hvis leadet allerede har 5 bookinger i alt, uanset status (migration `20261027000100`). Sætter leadet `booked` |
| `cancel_booking(booking_id)` | patient (ejer) eller klinik (verificeret ejer, lead sendt efter `owner_since`) | Kun `booked` og før `starts_at`. Sætter `cancelled`, `cancelled_by`, `cancelled_at`; leadet tilbage til `accepted` |
| `mark_booking_no_show(booking_id)` | klinik (verificeret ejer, lead sendt efter `owner_since`) | Kun effektiv status `booked` og `starts_at <= now() < ends_at + interval '24 hours'`. Sætter `no_show`, `no_show_at`. Efter fristen er bookingen gennemført og kan ikke ændres (409 `NO_SHOW_WINDOW_CLOSED`) |
| `patient_bookings(p_booking_id default null)` | patient (egne bookinger) | Læsefunktion (migration `20261026000100`): `booking_id`, `lead_id`, `clinic_id`, `clinic_name`, `clinic_address`, `clinic_city` (patienten har ingen SELECT på `clinics`, og en fjernet klinik skal kunne vises), `service_id`, `service_name`, `starts_at`, `ends_at`, effektiv `status` (4.2), `hold_expires_at` (kun `held`), `reviewed` (der findes en anmeldelse) og `created_at`. Nyeste starttid først. Giver intet for andres bookinger |
| `release_expired_holds(clinic_id)` | intern (kaldes kun af funktionerne ovenfor; ingen EXECUTE for `anon`/`authenticated`) | Sætter `held` med `hold_expires_at <= now()` for klinikken til `cancelled` |
| `complete_due_bookings()` | **kun service role** (planlagt job, `/api/cron/complete-bookings`, hver time) | Sætter `completed`, `completed_at = ends_at + 24 t` for `booked` med `ends_at + interval '24 hours' <= now()`, og `cancelled` for alle `held` med `hold_expires_at <= now()`. Ren oprydning; reglerne bygger på `effective_booking_status()` og `release_expired_holds()`, så intet afhænger af jobbet. Bruger ikke `auth.uid()` |
| `withdraw_consent(consent_id)`, `confirm_consent_cleanup(consent_id)` | patient (+anonym) | Som før, men billeder hænger på sager. Tilbagetrækning af `image_upload` sletter rækkerne i `case_images` (også på sendte sager), og billederne forsvinder dermed for klinikkerne. Tilbagetrækning af `health_data_sharing` sætter, **hvis patienten ikke har et andet aktivt samtykke af samme type**, alle patientens leads med status `sent`, og `accepted` uden aktiv booking, til `withdrawn` (klinikken mister adgangen, 5.7) og frigiver deres `held`-reservationer. `booked` bookinger består; patienten kan selv aflyse dem (`cancel_booking()`). Nye leads kræver nyt samtykke |
| Trigger `clinics_after_owner_removed()` | på `clinics`, når `owner_id` går fra en værdi til `null` (ejerens konto slettes; ikke en RPC) | **Altid først:** alle klinikkens leads med `sent` eller `accepted` sættes til `declined` med `decline_reason = 'clinic_left'` og `responded_at = now()`; `held`-reservationer frigives (`cancelled`, `cancelled_by = 'clinic'`); fremtidige `booked` bookinger (`starts_at > now()`) aflyses (`cancelled_by = 'clinic'`), og deres leads sættes til `declined` med `clinic_left`. Selve klinikrækken (status og felter) er allerede ændret af `clinics_guard()` i samme UPDATE (4.3); denne AFTER-trigger rydder **rækker i andre tabeller**:<br>**(a) importeret klinik** (`import_source is not null`, nu `imported`): sletter prisliste (`clinic_prices`), valgte kategorier (`clinic_service_groups`), blokerede tider (`clinic_time_blocks`) og tandlæger (`clinic_dentists`, og dermed `portfolio_items` via cascade). Åbningstiderne bevares som offentlige grunddata.<br>**(b) selvoprettet klinik** (`import_source is null`, nu `removed`): sletter det samme og desuden åbningstiderne (`clinic_opening_hours`), fordi klinikken aldrig vises igen. Rækken slettes **ikke**, og der bruges ingen cascade: patienternes leads, beskeder, bookinger og anmeldelser bevares, og patienten ser klinikkens navn og "Klinikken er ikke længere på TandMatch". Anmeldelserne er ikke offentlige (kun verificerede klinikker vises), men patienten ser sin egen. `removed` er endelig, og samme CVR opretter en ny klinik ved signup (CVR er nulstillet; `handle_new_user()`/`is_cvr_claimed()` knytter kun til `imported` uden ejer).<br>I begge tilfælde består afholdte bookinger og anmeldelser. Oprydningen sker i triggerne (besluttet), så den er atomar og også virker, når en konto slettes uden om API'et; service role bruges kun til filer og auth-bruger (2.3). Filerne i `public-media` slettes af `DELETE /api/clinics/me` (10.8), før auth-brugeren slettes |
| `approve_summary(case_id, summary_text, ai_assisted boolean default null)` | patient (+anonym, ejer) | Eneste vej til `summary_text`. Kun `draft`, max 1500. Sætter `summary_ai_assisted` ud fra parameteren (10.5); uden AI-udkast tvinges den til `false` (migration `20261019000200`) |
| `reserve_chat_turn(p_user_id, p_conversation_id, p_content)` | **kun service role** (serveren, med `p_user_id` fra den verificerede session, efter IP-grænsen og **før** modelkaldet; ingen EXECUTE for `authenticated`) | Én transaktion: advisory-lås, låser samtalen, tjekker selv ejer (`p_user_id`), kladde og aktivt `ai_processing`, tæller loftet pr. samtale (`ai_limits.chat_messages_per_conversation`, 30) og beskedlængden (`ai_limits.chat_message_max_chars`), døgnloftet pr. patient (`ai_limits.chat_messages_per_patient_day`, talt pr. UTC-dag i `ai_patient_usage_daily.chat_messages`, som ikke slettes med sagen), for anonyme loftet pr. anonym bruger (`ai_limits.anon_user_daily_ai_calls` = 40, tabel `ai_anon_user_usage_daily`, intern `consume_anonymous_ai_call()`) og det globale anonyme loft, og indsætter brugerbeskeden (allerede PII-maskeret). Eneste vej til at indsætte en brugerbesked i `ai_messages` (5.4). Fejler et led, rulles alt tilbage (migrationer `20261019000100` og `20261020000100`) |
| `store_ai_summary(p_user_id, case_id, …)` | **kun service role** | Skriver det validerede udkast. Tjekker internt, at sagen tilhører `p_user_id` og er `draft` |
| `append_assistant_message(p_user_id, conversation_id, …)` | **kun service role** | Indsætter assistentbesked (svar, foreløbig vurdering, foreslåede ydelser, akut, out-of-scope, blocked). Tjekker ejer, kladde og aktivt `ai_processing`; en lukket samtale accepteres kun ved loftet på 30, og kun når den seneste besked er patientens (migrationer `20261018000100` og `20261019000100`). Afviser ydelses-id'er, der ikke er aktive i kataloget |
| `consume_summary_generation(p_user_id, p_case_id)` | **kun service role** (serveren, med `p_user_id` fra den verificerede session, efter IP-grænsen; ingen EXECUTE for `authenticated`; migration `20261020000100`) | Tjekker selv ejer, kladde og aktivt `ai_processing`. Én transaktion: sagens loft (5), patientens døgnloft (20), for anonyme brugerens eget døgnloft (`anon_user_daily_ai_calls`, 429 `RATE_LIMITED`) og det globale loft. Øger tællerne |
| `try_consume_anonymous_ai_call(p_user_id)` | **kun service role** | Atomisk: tjekker at `p_user_id` er anonym, øger dagens tæller og returnerer `true` under loftet `ai_limits.anon_daily_ai_calls` (300). Bruger **ikke** `auth.uid()` (5.1 regel 8) |
| `consume_rate_limit(key, limit)` | **kun service role** | Uændret. IP kun som hash |
| `touch_last_active()` | `authenticated` | Uændret |
| `moderate(kind, id, status, reason)` | admin | **[IKKE BYGGET]** (heller ikke planlagt i demoen). Seed-anmeldelser er forhåndsgodkendte |
| `admin_set_clinic_status(clinic_id, status)` | **kun service role** (seed og admin-scripts) [PROTOTYPE] | Sætter `status` og `verified_at` via et transaktionsflag, som `clinics_guard()` kun accepterer fra denne funktion |
| `clinic_leads(p_status lead_status default null)`, `clinic_lead_detail(lead_id)`, `clinic_lead_images(lead_id)`, `clinic_bookings(from, to)`, `clinic_booking(booking_id)`, `clinic_reviews()` | klinik | Læsefunktioner (5.7). `p_status = null` giver alle |
| `public_clinics(p_service_ids uuid[], p_clinic_ids uuid[])` | alle, også `anon` | Kun synlige klinikker (5.1 regel 11): basisdata (inkl. Trustpilot) for `imported` uden ejer og for `verified`, plus fulde felter (logo, priser for de angivne ydelser, `has_emergency_hours`) for `verified`. `registered` returneres aldrig. Ingen `owner_id`, ingen `cvr` |
| `public_clinic_profile(clinic_id)` | alle | Som ovenfor for én klinik, plus beskrivelse, hele prislisten, åbningstider, tandlæger og portefølje (kun `verified`) |
| `public_busy_intervals(clinic_ids uuid[], from, to)` | alle | Optagede tidsrum (ikke-udløbne `held`- og `booked`-bookinger samt blokeringer) for verificerede klinikker. Kun `starts_at`/`ends_at`, ingen id'er, ingen typer. Grundlag for ledige tider (6.7) |
| `public_reviews(clinic_id)`, `public_clinic_review_stats_many(clinic_ids)` | alle | Godkendte anmeldelser og godkendte svar; statistik (4.3, 8.3). Kun for verificerede klinikker |

Fjernet fra den gamle model og må ikke genskabes: `send_request`, `decide_response`, `dentist_*`, `public_dentists`, `public_dentist_review_stats*`, `demo_set_dentist_verification`, `responses_after_insert`, `is_editable_request_text`, `dentist_visits`.

### 5.4 Policies pr. tabel

`uid` = `auth.uid()`.

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | `id = uid` eller `is_admin()` | kun trigger | ingen | cascade |
| patients | `id = uid` | kun trigger | `id = uid` (kun `first_name`, `postal_code`, `phone`) | via kontosletning |
| terms_acceptances | `user_id = uid` eller `is_admin()` | `user_id = uid` | ingen | cascade |
| consents | `patient_id = uid` | `patient_id = uid`; `health_data_sharing` kræver `is_permanent_user()` | ingen (`withdraw_consent`) | ingen |
| consent_text_versions, postal_codes, services, service_groups | offentlig (`services` og `service_groups`: kun `is_active` for ikke-admins; policyen på `services` skjuler også behandlinger i en inaktiv kategori; migration `20261016000200`, RLS-test 38) | ingen | ingen | ingen |
| clinic_service_groups | `is_clinic_owner(clinic_id)` | ingen direkte; kun via `set_clinic_service_groups()` | ingen | ingen direkte; kun via `set_clinic_service_groups()` |
| ai_limits, ai_usage_daily, ai_patient_usage_daily, rate_limits | ingen | ingen | ingen | ingen |
| clinics | `is_clinic_owner(id)` eller `is_admin()`. Offentligt via `public_*` | kun signup-trigger | `is_clinic_owner(id)` (trigger `clinics_guard()` låser status, ejer, CVR m.m.) | ingen |
| clinic_prices, clinic_opening_hours, clinic_time_blocks, clinic_dentists | `is_clinic_owner(clinic_id)`. Offentligt via `public_*` (blokeringer kun som optagede tidsrum) | `is_clinic_owner(clinic_id)` og `is_permanent_user()` (`clinic_prices`: trigger kræver valgt kategori og aktiv behandling) | som insert | som insert. Hel udskiftning af prisliste og åbningstider sker via `replace_clinic_prices()` og `replace_opening_hours()` (5.3) |
| portfolio_items | `is_clinic_owner(clinic_id)`. Offentligt via `public_clinic_profile()` | **ingen** for `authenticated`; kun service role efter upload (9.5) | `is_clinic_owner(clinic_id)` (kun `caption`, `service_id`) | ingen for `authenticated`; slettes af serveren med service role (filen skal også slettes) |
| cases | `patient_id = uid` | `patient_id = uid` og `status = 'draft'` (trigger: anonym max 1) | `patient_id = uid` og `status = 'draft'` (trigger låser beskyttede felter; kolonne-grants, 5.1 regel 12) | **ingen**. Kladder slettes af serveren med service role efter ejer- og kladdetjek, som også sletter billedfilerne (`DELETE /api/cases/{id}`, 10.5) |
| case_services | `is_case_owner(case_id)` | `is_case_owner(case_id)` og sagen er `draft` og ydelsen aktiv | ingen | `is_case_owner(case_id)` og sagen er `draft` |
| ai_conversations | `patient_id = uid` | `patient_id = uid` og `is_case_owner(case_id)` og `draft` og `has_active_consent('ai_processing')` | ingen | cascade |
| ai_messages | `patient_id = uid` | **ingen** for `authenticated`: brugerbeskeder indsættes kun af `reserve_chat_turn()` og assistentsvar af `append_assistant_message()` (begge service role). Policyen `ai_messages_insert_own_user` er droppet (migration `20261020000100`) | ingen | cascade |
| case_images | `patient_id = uid`. Klinikker via `clinic_lead_images()` | ingen for `authenticated` (service role) | ingen | ingen for `authenticated` (service role) |
| leads | Kun `is_case_owner(case_id)`. **Klinikker har ingen direkte SELECT** (migration `20261024000100`); de læser via `clinic_*`-funktionerne (5.7) og `clinic_lead_status()` | **ingen** (kun `send_leads`) | **ingen** (kun funktionerne i 5.3) | ingen |
| messages | Kun patienten direkte: `sender_id = uid` eller sagens ejer via `is_case_owner`. **Klinikker har ingen SELECT**; de læser via `clinic_lead_messages()` (5.7). Kolonne-grant: `authenticated` kan læse `id`, `lead_id`, `sender_role`, `body`, `created_at` og `read_at`, men ikke `sender_id` (klinikejerens bruger-id; security trin 5, L1; migration `20261024000100`) | `sender_id = uid` og `is_permanent_user()` og `is_lead_participant(lead_id)` og `is_lead_thread_open(lead_id)` (`created_at`/`read_at` sættes af trigger, 5.1 regel 15) | patienten må sætte `read_at` på modtagne beskeder (`sender_role = 'clinic'`, også når afsenderen er slettet; kolonne-grant); klinikken via `clinic_mark_messages_read()`. `messages_before_insert()` er security definer og udleder `sender_role` (en afvigende værdi giver `SENDER_ROLE_MISMATCH`); `messages_before_update()` tillader kun, at `sender_id` bliver null (migration `20261023000100`) | ingen |
| bookings | `patient_id = uid`. Klinikker **ingen** direkte; kun via `clinic_bookings()`/`clinic_lead_detail()` | ingen (kun `book_slot`) | ingen (kun `cancel_booking`, `complete_booking`) | ingen |
| reviews | `patient_id = uid` eller `is_admin()`. Offentligt via `public_reviews()`, klinikken via `clinic_reviews()` | se 8.1 | ingen | ingen ([IKKE BYGGET]) |
| review_replies | `clinic_id = auth_clinic_id()` eller `is_admin()`. Offentligt via `public_reviews()` | `review_is_for_my_clinic(review_id)` og `review_is_approved(review_id)` og `clinic_id = auth_clinic_id()` | ingen | ingen |

Note: indtil migration `20261024000100` havde klinikker direkte SELECT på hele `leads`-rækken, også `case_id` og felterne på tilbagetrukne leads (security trin 5, H1). Policyen er nu `leads_select_case_owner`; alt, klinikken læser om et lead, går gennem security definer-funktioner, der skjuler `case_id` og indholdet af tilbagetrukne leads.

### 5.5 Isolation og skjulte kontaktoplysninger

- `leads` SELECT direkte har én vej ind: *du ejer sagen*. Klinikken læser kun sine egne leads via `clinic_*`-funktionerne og `clinic_lead_status()` (ejer, `verified`, `sent_at >= owner_since`), som aldrig returnerer `case_id`. At have et lead på samme sag giver **ikke** adgang til andre leads på sagen.
- `messages` læses af klinikker kun via `clinic_lead_messages()`, som kræver `is_lead_participant` (verificeret klinik, lead efter `owner_since`, ikke `withdrawn`) og aldrig returnerer `sender_id`.
- Overtager en ny ejer en klinik (fx via CVR), ser den intet fra før `owner_since`: ingen leads, beskeder, bookinger eller kontaktoplysninger (5.1 regel 16).
- Ingen funktion, view eller route returnerer noget om andre leads på en sag til en klinik (fx antal, status, priser). `send_leads` returnerer kun antal til patienten.
- **Kontaktoplysninger** ligger kun i `bookings.contact_*` (og `patients.phone`, som kun patienten selv kan læse). Klinikken har ingen SELECT på `bookings` eller `patients`. `clinic_bookings()` og `clinic_lead_detail()` returnerer `contact_*` kun, når bookingen tilhører klinikken og har effektiv status `booked` eller `completed`. En reserveret akuttid (`held`) viser ingen kontakt, før klinikken har accepteret. Det er dermed databasen, ikke UI, der skjuler navn og kontakt.
- `patient_id` når aldrig klinikken: ikke i funktioner, ikke i storage-stier, ikke i DTO'er.
- AI-chatten er kun synlig for patienten.

### 5.6 Obligatoriske RLS-tests (security/tester)

SQL-scripts i `tests/rls/`, kørt mod lokal Supabase efter `supabase db reset`. De skifter rolle og JWT-claims for testbrugere. De fleste testfiler har samme nummer som punktet; ved punkt 31-41 står filnavnet, fordi flere punkter deler fil:
1. Klinik X og Y har begge et lead på sag S. X kan ikke læse Y's lead, beslutning, beskeder eller bookinger (direkte tabel og via funktioner).
2. Klinik Z uden lead på S kan ikke læse S, S's ydelser, billeder (tabel, `clinic_lead_images()`) eller leads.
3. Patient A kan ikke læse patient B's sager, ydelser, AI-samtaler, billeder, samtykker, leads, bookinger, beskeder eller anmeldelser.
4. Ingen klinik kan læse `ai_conversations`, `ai_messages`, `cases`, `case_images`, `bookings` eller `patients` direkte.
5. Klinikken får `contact_*` = `null` fra `clinic_lead_detail()`/`clinic_bookings()` for et lead uden booking, en `held`-akuttid, et lead med aflyst booking og et lead med `no_show`; og udfyldt for `booked` og (effektivt) `completed`. `patient_id` returneres aldrig.
6. `send_leads` afviser: anonym bruger, et fjerde **aktivt** lead, samme klinik to gange, ikke-verificeret klinik, manglende opsummering, ingen bekræftede ydelser, manglende `health_data_sharing`. Efter én afvisning eller tilbagetrækning kan et nyt lead sendes til en anden klinik. Det 11. lead på en sag afvises, uanset status på de 10 første.
7. `book_slot` afviser: lead der ikke er `accepted`, en andens lead, overlappende tid inkl. en `held`-akuttid (samtidige kald: kun ét lykkes), tid uden for åbningstid, almindelig ydelse i akutvindue, tid i blokering.
8. `clinic_decide_lead` afviser andre end ejeren af leadets klinik og en ikke-verificeret klinik; et `declined` eller `withdrawn` lead kan ikke accepteres. Accept af et akut-lead inden for 30 minutter gør `held` til `booked`; afvisning frigiver tiden, så en anden kan booke den. Accept efter udløb giver `accepted` uden booking.
9. Anmeldelse afvises før `ends_at + 24 timer`, ved `no_show`, ved `cancelled` og ved anden anmeldelse af samme booking; den tillades efter fristen, selv om `complete_due_bookings()` ikke har kørt. `mark_booking_no_show` afvises før starttid og efter `ends_at + 24 timer`, men tillades lige efter sluttid.
10. Besøgende uden session kan kun læse offentlige tabeller og `public_*`-funktioner; `public_*` returnerer ingen priser, tandlæger eller portefølje for `imported` klinikker, slet ingen `registered` klinikker (heller ikke en overtaget importeret klinik), og aldrig `owner_id` eller `cvr`.
11. Klinik kan ikke ændre egen `status`, `owner_id` eller `cvr`, og kan ikke redigere en anden kliniks prisliste, åbningstider, tandlæger eller portefølje.
12. Anonym session kan ikke: kalde `send_leads`, give `health_data_sharing`, oprette en anden kladde, skrive beskeder eller anmeldelser, booke.
13. Efter kontooprettelse har brugeren samme id og ser fortsat sin kladde, chat, billeder og samtykker; en anden bruger med `case_id` får intet.
14. Patient kan ikke ændre `status`/`user_message_count` på `ai_conversations`, ikke indsætte noget i `ai_messages` (hverken `user` eller `assistant`), ikke ændre `summary_text` direkte, ikke kalde `append_assistant_message()`, `store_ai_summary()`, `reserve_chat_turn()`, `consume_summary_generation()` eller `try_consume_anonymous_ai_call()`.
15. `try_consume_anonymous_ai_call(p_user_id)` kaldt med service role returnerer `true` for en anonym bruger under loftet, `false` over loftet og `false` for en permanent bruger.
16. Billeder: upload og insert efter afsendelse afvises; uden aktivt `image_upload` afvises; efter tilbagetrækning returnerer `clinic_lead_images()` intet.
17. `terms_acceptances`: A kan ikke læse eller ændre B's, ingen kan ændre egne.
18. Beskeder kan sendes af begge parter på et lead med status `sent`, men ikke på `declined` eller `withdrawn`. Efter `withdrawn` kan klinikken hverken læse sagens indhold, billeder eller beskeder.
19. `withdraw_lead` afvises for andre end sagens ejer og for leads, der ikke er `sent`; en `held`-akuttid frigives.
20. `public_reviews()` og `public_clinic_review_stats_many()` returnerer intet for `imported`/`registered` klinikker.
21. En `held`-akuttid ældre end 30 minutter (simuleret ved at sætte `hold_expires_at` i fortiden) blokerer ikke `book_slot()` for en anden patient, vises ikke i `public_busy_intervals()` og har effektiv status `cancelled`, uden at `complete_due_bookings()` har kørt. `release_expired_holds()` kan ikke kaldes af `authenticated`.
22. `close_case()`: kun ejeren; `sent`- og ubookede `accepted`-leads bliver `withdrawn`, `held` frigives, `booked` består; en lukket sag kan ikke få nye leads.
23. Tilbagetrækning af `health_data_sharing` gør patientens `sent`- og ubookede `accepted`-leads `withdrawn` (klinikken mister adgang) og frigiver `held`; `booked` består.
24. Når en verificeret kliniks ejer slettes: `sent`/`accepted` leads bliver `declined` med `clinic_left`, `held` frigives, fremtidige `booked` aflyses, og afholdte bookinger og anmeldelser består. Klinikken bliver `imported`, hvis den har `import_source`, og `removed`, hvis den oprettede sig selv. En klinik kan ikke selv sætte `clinic_left` via `clinic_decide_lead()`.
25. `book_slot()` og `send_leads()` afviser starttider, der ikke ligger på et helt kvarter (fx 10:07 eller 10:15:30).
26. Kolonne-grants: `authenticated` kan ikke opdatere andre kolonner end dem i 5.1 regel 12 (fx `cases.status`, `clinics.status`, `messages.body`), selv om RLS-policyen tillader rækken. `public_*` returnerer aldrig en `registered` klinik. `is_cvr_claimed()` returnerer kun boolean.
27. **Overtagelse via CVR:** en ny ejer, der overtager en klinik (CVR-tilknytning efter at den tidligere ejer er slettet), ser ingen leads, beskeder, bookinger, kontaktoplysninger eller anmeldelser med `sent_at` før `owner_since`, hverken direkte eller via `clinic_*`-funktionerne.
28. En klinik har ingen direkte SELECT på `messages`; `clinic_lead_messages()` returnerer aldrig `sender_id` og intet for en ikke-verificeret klinik, et `withdrawn` lead eller et lead fra før `owner_since`.
29. En ikke-verificeret klinik kan ikke læse `leads`, kalde `cancel_booking()` eller `mark_booking_no_show()`.
30. `authenticated` kan ikke kalde `effective_booking_status(uuid)`, ikke slette `cases` direkte, ikke sætte `created_at`/`read_at` ved insert i `ai_messages`/`messages` (triggeren overskriver), og har ikke `TRUNCATE`, `REFERENCES` eller `TRIGGER` på nogen tabel.
31. (Fil `30_quarter_check_and_hardening.sql`.) Tilbagetrækning af ét `health_data_sharing`-samtykke trækker ikke leads tilbage, hvis patienten har et andet aktivt samtykke af samme type.
32. (Fil `32_clinic_deletion_cleans_rows.sql`.) `public_*` returnerer ikke en `registered` klinik, heller ikke en importeret klinik, der lige er overtaget via CVR; efter `admin_set_clinic_status(..., 'verified')` vises den.
33. (Fil `32_clinic_deletion_cleans_rows.sql`.) Når ejeren af en overtaget importeret klinik slettes, er klinikken `imported` med bevarede grunddata og uden klinikindtastet indhold. Når ejeren af en selvoprettet klinik slettes, er klinikken `removed`: rækken findes, `cvr` er `null`, kun navn og adresse er bevaret, og patienternes leads, beskeder, bookinger og anmeldelser findes stadig. Begge dele virker også, når auth-brugeren slettes uden om API'et.
34. (Fil `33_dentist_grants_website_and_limits.sql`.) Ejeren kan ikke selv skrive `clinic_dentists.photo_path`/`photo_updated_at` eller `portfolio_items.image_path`, og `clinics.website` uden `http(s)://` afvises.
35. (Fil `33_dentist_grants_website_and_limits.sql`.) Lofterne for tandlæger (30), portefølje (60), åbningsvinduer (42) og blokeringer (200) afvises i databasen ved direkte insert med brugerens JWT.
36. (Fil `36_clinic_removed.sql`.) En `removed` klinik: returneres ikke af nogen `public_*`-funktion (heller ikke dens anmeldelser og statistik); kan ikke modtage leads (`leads_clinic_guard()`) eller bookinger; `clinics_guard()` afviser ændringer af den, også fra admin-funktionen; check `clinics_status_owner_check` holder; en ny signup med det tidligere CVR opretter en ny `registered` klinik; patienten kan stadig læse sine egne leads, beskeder, bookinger og anmeldelser for klinikken og se klinikkens navn.
37. (Fil `37_takeover_cannot_alter_public_data.sql`.) En uverificeret ejer, der har overtaget en importeret klinik via CVR og ændret grunddata eller åbningstider, kan ikke efterlade ændringerne offentligt: når ejeren fjernes, gendannes grunddata og åbningstider fra `clinic_import_snapshots`, og snapshottet slettes. En verificeret ejers ændringer bevares. Ingen bruger (anon/authenticated) kan læse eller skrive `clinic_import_snapshots`.
38. (Fil `38_services_hidden_in_inactive_group.sql`.) Policyen på `services` skjuler en aktiv behandling i en inaktiv kategori for `anon` og `authenticated` (ikke-admin), også ved direkte tabellæsning uden om API'et.
39. (Fil `31_service_groups_and_prices.sql`.) Katalog- og prisreglen: en pris på en behandling i en ikke-valgt kategori afvises; fravalg af en kategori via `set_clinic_service_groups()` sletter priserne i den; `clinic_service_groups` er kun synlig for ejeren; inaktive kategorier og behandlinger kan ikke vælges eller prissættes; behandlinger i kategorien `akut` har typen `emergency`.
40. (Fil `40_image_description_shared_after_approval.sql`.) `clinic_lead_images()` returnerer kun `approved_description`, når patienten har godkendt opsummeringen efter beskrivelsen blev skrevet (`summary_approved_at >= ai_described_at`); beskrivelser uden tidsstempel er skjulte.
42. (Fil `39_reserve_chat_turn.sql`.) `reserve_chat_turn()` tæller alle lofter i én transaktion og indsætter kun patientens egen besked; samtidige kald kan ikke overskride lofterne.
41. (Fil `41_ai_calls_service_role_only.sql`.) `authenticated` kan ikke kalde `reserve_chat_turn()` eller `consume_summary_generation()` og kan ikke indsætte i `ai_messages`; med service role afvises et forkert `p_user_id`, en sag, der ikke er kladde, og manglende `ai_processing`; sletning af en sag nulstiller ikke `ai_patient_usage_daily.chat_messages`; en anonym bruger rammer sit eget døgnloft (429) før det globale.
43. (Fil `42_patient_lead_clinics.sql`.) `patient_lead_clinics()` returnerer kun klinikker på patientens egne leads (også `removed`, uden logo); anden patient, klinik og anonym får intet.
44. (Fil `43_leads_daily_limit.sql`.) Det 16. lead pr. patient på 24 timer afvises på tværs af sager, også via `send_leads()`; ældre leads tæller ikke.
45. (Fil `44_message_sender_role.sql`.) `sender_role` sættes af databasen og kan ikke forfalskes eller ændres; klinik Y ser intet af X's tråd (tabel og alle `clinic_*`-funktioner); tråden er lukket ved `declined`/`withdrawn`; sletning af klinikkonto bevarer beskederne (`sender_id` null, `sender_role = 'clinic'`), og patienten kan markere dem som læst.
46. (Fil `45_clinic_lead_access.sql`.) En klinik får 0 rækker ved direkte SELECT på `leads` (også egne og tilbagetrukne leads); `clinic_lead_status()` giver status for egne leads og null for fremmede, for en ikke-verificeret klinik og for leads fra før `owner_since`; patienten kan ikke læse `messages.sender_id`, men stadig de øvrige kolonner; `clinic_leads().image_count` tæller ikke billeder, når `image_upload`-samtykket er trukket tilbage.
47. (Fil `46_clinic_lead_detail_unread.sql`.) `clinic_lead_detail().unread_messages` tæller patientens ulæste beskeder, er 0 efter markering som læst og for et tilbagetrukket lead, og en anden klinik får ingen række; `clinic_leads()` sorterer kun på akut for leads, der ikke er trukket tilbage (et tilbagetrukket akut-lead kommer ikke før et ikke-akut).
48. (Fil `47_booking_reads.sql`.) `patient_bookings()` giver kun patientens egne bookinger (effektiv status, klinikkens navn, adresse og by, `reviewed`); en anden patient, en klinik og anonyme får ingen række eller afvises. `clinic_booking()` giver kun klinikkens egen booking, uden kontaktfelter for `held`, og en anden klinik og patienten får ingen række.
49. (Fil `48_booking_limit.sql`.) `book_slot()` afviser den 6. booking på samme lead med `BOOKING_LIMIT`, også når de tidligere er aflyst, udeblevet eller gennemført; loftet er pr. lead (et andet lead hos samme klinik og en anden patients lead er upåvirket), og de afviste kald efterlader ingen booking; anonyme afvises stadig (`42501`) og en klinik får `NOT_FOUND`.

API-tests (obligatoriske): vilkårs-gaten (403 `TERMS_REQUIRED`, forfalsket cookie afvises, ny version kræver ny accept) og "vilkårs-accept giver ikke samtykke" (403 `CONSENT_REQUIRED` ved upload/chat).

### 5.7 Klinikkens læsevisninger

Alle kræver, at den kaldende ejer klinikken. Leads og bookinger kræver desuden `verified`.

Alle funktionerne returnerer kun leads med `sent_at >= clinics.owner_since` (og det, der hænger på dem). For leads med status `withdrawn` returnerer de kun id, status, `sent_at` og `withdrawn_at`; intet sagsindhold, ingen billeder, ingen beskeder. Beskeder læses via `clinic_lead_messages()` og markeres læst via `clinic_mark_messages_read()` (5.3).

- `clinic_leads(p_status)`: egne leads, evt. filtreret på status, med status, ydelsesnavne, område, afstand, ønsket tidsrum, akutmarkering, ønsket akuttid, antal billeder, `sent_at`, `seen_at`, ulæste beskeder. Ingen `patient_id`, ingen `case_id`.
- `clinic_lead_detail(lead_id)`: sagens godkendte indhold (ydelser, `summary_text`, `summary_ai_assisted`, ønsket tidsrum, område, akut), listepris-snapshot, egen beslutning, antal ulæste beskeder fra patienten (`unread_messages`, migration `20261025000100`) og den aktive eller seneste booking med `contact_*` efter reglen i 5.5.
- `clinic_leads()` sorterer ubesvarede først, derefter akut (kun for leads, der ikke er trukket tilbage, så rækkefølgen ikke afslører akut-status for et tilbagetrukket lead; migration `20261025000100`), derefter nyeste.
- `clinic_lead_images(lead_id)`: billedstier og godkendte beskrivelser, kun med aktivt `image_upload`-samtykke. Serveren signerer stierne (9.2).
- `clinic_bookings(from, to)`: kalenderen: egne bookinger med ydelse, tider, status, `lead_id` og `contact_*` efter reglen i 5.5.
- `clinic_booking(p_booking_id)`: én af klinikkens egne bookinger med samme kolonner og regler som `clinic_bookings()` (bruges til svaret efter aflysning og udeblivelse; migration `20261026000100`). En anden klinik får ingen række.
- `clinic_reviews()`: godkendte anmeldelser af egen klinik + eget svar og dets status.

---

## 6. Sider og routes (App Router)

Status: bygget i trin 1 er `/opret/klinik`, `/klinik` (opsætningsoversigt; fra 5.3 også lead-indbakken, se 6.3), `/klinik/profil`, `/klinik/prisliste` (med kategorier, 1.9), `/klinik/aabningstider` og `/klinik/tandlaeger`, samt kernens sider (vilkår, login, `/opret`, `/opret/patient`). Bygget i trin 2 (`a3f8d47b`, `ea70980b`): `/`, informationssiderne, `/klinikker` og `/klinikker/[clinicId]`. Bygget i trin 3 (3.4): `/start` og `/start/[caseId]`. Bygget i trin 4: `/start/[caseId]/send`, `/patient` og `/patient/sag/[caseId]`. Bygget i trin 5 (5.3): lead-indbakken på `/klinik` og `/klinik/lead/[leadId]`. Alle andre sider i 6.1-6.4 er [IKKE BYGGET].

Slugs er danske uden æøå. Alle sider er mobile-first og tjekkes ved 390 px og 1280 px. Design: hvid og blå, farverne i Tailwind-temaet.

### 6.1 Offentlige sider

| Route | Indhold |
|---|---|
| `/` | Forside: kort forklaring, to indgange ("Beskriv dit problem" → `/start`, "Find en klinik" → `/klinikker`) og en tydelig "Jeg har ondt" → `/akut`. Indtil `/akut` bygges i trin 7, fører "Jeg har ondt" til `/klinikker?akut=1` (oversigtens akutfilter) |
| `/start` | Start på chatten uden login: særskilt AI-samtykke (ikke billedsamtykke). Opretter anonym session og tom sag og sender til `/start/[caseId]`. Patienter med konto opretter sagen via `POST /api/cases`. Har sessionen allerede en kladde, fortsættes den |
| `/start/[caseId]` | **Sagsflowet** for anonyme og patienter med konto, der ejer sagen. Server-vagt `guardCaseFlow()` (patient, anonym tilladt; ejerskab tjekkes af API'et). Fem trin: (1) **Beskriv**: chat med AI'en (fast tekst over chatten: "Skriv ikke dit navn, din adresse eller kontaktoplysninger"; efter et akut-svar vises en fast akut-blok over inputfeltet), (2) **Billeder** (billedsamtykke lige før første upload), (3) **Behandlinger**: bekræft AI'ens forslag ("Jeg er ikke sikker" → Undersøgelse), (4) **Tid og sted**: ønsket tidsrum og postnummer, (5) **Opsummering**: ret og godkend; AI'ens billedbeskrivelser vises her med mærkatet "Beskrivelse, ikke vurdering" og godkendes sammen med teksten. Derefter "Find klinikker" → `/klinikker?sag=[caseId]` (trin 4). Sendte og lukkede sager vises med hver deres faste tekst i stedet for flowet. Anonyme ser `AnonymousPatientBanner` (48 timer, opret konto, slet) |
| `/start/[caseId]/send` | Afsendelse til de valgte klinikker (op til 3, sendt med som `?klinikker=`): opret konto hvis anonym (inline, 7.7), samtykke til deling, oversigt over valgte klinikker med listepris, send. Derefter en bekræftelse med link til `/patient/sag/[caseId]`. Bygget i 4.2 |
| `/klinikker` | Klinikoversigt: liste + kort (Leaflet, OpenStreetMap) + filtre (ydelse, afstand/postnummer, maks. pris, min. bedømmelse, kun med ledig akuttid, kun klinikker, der kan kontaktes) og sortering (6.6). Med `?sag=` er sagens bekræftede ydelser og postnummer forvalgt, og patienten kan markere op til 3 klinikker minus sagens aktive leads til sammenligning og afsendelse; klinikker, sagen allerede har været sendt til, kan ikke vælges (bygget i 4.2). Valget gemmes pr. sag i `sessionStorage` (kun klinikkens id og navn, `views/utils/compare-selection.ts`), ikke i URL'en, så det består ved profil/tilbage. Kortet viser de samme klinikker som listen. Filtre og sortering spejles i URL'en med samme nøgler som API'et (`views/utils/clinic-query.ts`), så profil/tilbage og deling bevarer dem; `akut=1` slår akutfilteret til, og `sag` bevares. Postnummer og filtre står i URL'en; "Brug min position" (`lat`/`lng`) gør **ikke** (besluttet): positionen holdes kun i komponentens tilstand og sendes til API'et, men gemmes aldrig i URL'en eller på serveren. I akutvisningen henvises også til tandlægevagten (1813) uden for åbningstid, især når listen er tom. Bygget i 2.5 og 2.8 |
| `/klinikker/[clinicId]` | Klinikprofil: grunddata, åbningstider, kort, Trustpilot, anmeldelser og prisnøjagtighed. Verificerede også: beskrivelse, prisliste, første ledige tid, tandlæger med portefølje. Bygget i 2.6. "Vælg klinik" med `?sag=` (bygget i 4.2); tilbagelinket bevarer sagen. [PROTOTYPE]: siden hentes i browseren, så sidetitlen er generisk, og en ukendt eller skjult klinik giver en fejlside med HTTP 200 i stedet for 404; serverside-hentning med titel og 404 kommer senere |
| `/akut` | Akutvejen: vælg akutydelse (forvalgt hvis kun én), klinikker sorteret efter første ledige akuttid. Patienten vælger klinik og tid, **logger ind eller opretter konto** (kræves), skriver kort hvad der er galt, angiver navn og telefon, giver delingssamtykke og sender. Opretter en sag med `is_emergency = true` og ét lead; tiden **reserveres straks** (`held`) i højst 30 minutter (eller til starttid, hvis den kommer før), så andre ikke kan tage den. Accepterer klinikken inden da, bliver reservationen en booking; afviser den, trækker patienten leadet tilbage, eller udløber reservationen, frigives tiden, og patienten kan vælge en anden klinik. UI viser, hvor længe reservationen gælder. Ingen AI i akutvejen |
| `/login`, `/opret`, `/opret/patient`, `/opret/klinik` | Login og signup. `/opret/klinik` beder om CVR, klinikkens navn, adresse, postnummer, by, telefon. Teksten må ikke antyde, at CVR slås op i CVR-registret (det gør vi ikke); den forklarer, at CVR bruges til at knytte kontoen til klinikken og til verifikation |
| `/saadan-virker-det`, `/saadan-tjener-vi-penge`, `/for-klinikker`, `/om-os`, `/kontakt` | Informationssider (statisk indhold, ingen API; bygget i 2.4). "Sådan tjener vi penge" beskriver prototypens model: klinikker betaler for leads, patienter betaler ikke (forretningsmodellen er åben, 12.3 punkt 31). Indgangen til chatten er synlig i headeren på alle offentlige sider og patientsider og fører til `/start`. (`CHAT_READY` er fjernet) |
| `/vilkaar/accepter`, `/vilkaar`, `/privatliv` | Vilkårs-gaten og tekster (2.5). Bygget |

### 6.2 Patientflade (`/patient`, rolle `patient`, permanent konto)

| Route | Indhold |
|---|---|
| `/patient` | Mine sager med status, leads (status pr. klinik) og sagens næste booking (`CaseListItemDto.nextBooking`, vises fra 6.7). Bygget i 4.3; bookingerne har egen side, `/patient/bookinger` |
| `/patient/sag/[caseId]` | Sagen: hvert lead med klinik, status, klinikkens kommentar, præciseret pris og listepris, "Træk tilbage" ved ubesvaret lead, "Book tid" ved accepteret lead, beskedtråd pr. lead (åben fra afsendelse), "Kontakt flere klinikker" (når `canSendCase` tillader det) og "Luk sag". Bygget i 4.3: leads, "Træk tilbage" og "Kontakt flere klinikker"; i 5.3: beskedtråd pr. lead; i 5.5: klinikkens afvisningsnote under årsagen. i 6.3: "Book tid" og bookingen med "Aflys" på leadet. "Luk sag" er [IKKE BYGGET] (trin 7) |
| `/patient/sag/[caseId]/book/[leadId]` | (6.7: på mobil en fast bundlinje med den valgte tid og "Book tid"; dagsgrupperne viser datoer, ikke "Dag 15 til 28") Vælg ydelse (blandt sagens bekræftede), vælg ledig tid, indtast fulde navn og telefon (forudfyldt), book. Tider vises pr. dag (6 ad gangen, "Vis flere tider"), bladring 14 dage ad gangen inden for bookinghorisonten; ved `SLOT_TAKEN`/`SLOT_UNAVAILABLE` hentes tiderne igen. Link "Book tid" fra det accepterede lead på sagen. Bygget i 6.3 |
| `/patient/bookinger` | Kommende og tidligere bookinger; aflys før starttid (med bekræftelse). Punktet "Bookinger" i patientens navigation. Bygget i 6.3 |
| `/patient/anmeldelser`, `/patient/anmeld/[bookingId]` | Gennemførte bookinger, der kan anmeldes, mine anmeldelser; anmeldelsesformular. Bygget i 6.5: `/patient/anmeldelser` viser besøg med "Skriv anmeldelse" og egne anmeldelser med status ("Afventer godkendelse", "Offentliggjort", "Afvist" med begrundelse) og klinikkens godkendte svar; formularen (stjerner som radioknapper på 48 px, tegntæller, prisnøjagtighed, valgfri faktisk pris, gennemsigtighed) viser prisoverslaget og en moderationsnote, og et ukendt eller ikke-anmeldbart `bookingId` giver en venlig besked. "Skriv anmeldelse" står også på bookingen (bookingoversigten og sagens lead). Punktet "Anmeldelser" i navigationen |
| `/patient/samtykker` | Samtykker, tilbagetrækning, dataeksport |
| `/patient/konto` | Profil (navn, postnummer, telefon), slet konto |

### 6.3 Klinikflade (`/klinik`, rolle `clinic`)

En `registered` klinik ser et banner "Afventer verificering" og kan sætte alt op, men indbakke og kalender er tomme, indtil den er verificeret.

| Route | Indhold |
|---|---|
| `/klinik` | Lead-indbakke (bygget i 5.3) i API'ets rækkefølge: ubesvarede først, akut før ikke-akut, nyeste først (`clinic_leads()`; viewet sorterer ikke selv). Hver række viser status, akut-mærke (tone `danger`), ydelser, område, ønsket tidsrum eller tid, antal billeder og ulæste beskeder. Opsætningsoversigten (`clinic-overview`) med status for profil, prisliste, åbningstider og tandlæger står under indbakken. Verifikationsbanneret står øverst på siden og vises kun for en `registered` klinik (ikke en grøn bekræftelse ved hvert besøg). Siden henter klinikken én gang (`clinic-home.tsx`) til banner og oversigt; indbakken henter selv `/api/leads` |
| `/klinik/lead/[leadId]` | **Lead-kortet**, bygget til under et minut: ydelser, opsummering, billeder, tidsrum, område, listepris. Knapper: Accepter / Accepter med kommentar (+ evt. præciseret pris) / Afvis (hurtige begrundelser). Beskedtråden er åben fra start, så klinikken kan stille et afklarende spørgsmål før beslutning. Efter booking vises navn, telefon og e-mail. Åbning sætter `seen_at`. Tilbagetrukne leads vises kun som "Trukket tilbage af patienten". På mobil står beslutningsknapperne lige efter faktaboksen og før opsummering og billeder, og hele *Accepter* er synlig uden at scrolle ved 390 × 844 px (kompakt faktaboks: ingen gentagelse af ydelserne fra overskriften, korte felter i to kolonner). DOM-rækkefølgen følger mobilrækkefølgen, så tastatur og skærmlæser når beslutningen før billederne; desktop placerer med grid. På desktop står beslutning, kontaktnote og tråd i højre kolonne ud for faktaboksen (ikke sticky, ingen indlejret scroll i kolonnen; kun beskedlisten scroller). Afvisningsårsagen er forvalgt til "Ingen ledig kapacitet" (bevidst, så afvisning er to tryk). Ved et akut-lead med ønsket tid siger hjælpeteksten, at tiden bliver booket, når klinikken accepterer |
| `/klinik/kalender` | Bookinger og reserverede akuttider pr. dag/uge, marker udeblevet (fra starttid til 24 timer efter sluttid), aflys; blokeringer. Besøg bliver automatisk gennemført, når fristen er udløbet. Reserverede akuttider vises med udløbstidspunkt. Bygget i 6.4 som dagskort (to kolonner fra `lg`, ingen ugevisning); aflyste tider er skjult bag en knap; fra 6.7 starter listen ved i dag, og tidligere dage ligger bag "Vis tidligere dage (n)"; en ikke-verificeret klinik ser en kort tekst i stedet for en fejl (det samme på `/klinik/anmeldelser`); udeblevet og aflys kræver bekræftelse; link til lead-kortet; punktet "Kalender" i klinikkens navigation. Blokeringer redigeres fortsat på `/klinik/aabningstider` |
| `/klinik/profil` | Grunddata, beskrivelse, logo, kontakt, Trustpilot, slet konto (med advarsel om, at åbne leads afvises og fremtidige bookinger aflyses) |
| `/klinik/prisliste` | To trin på samme side: (1) klinikken krydser de kategorier af, den arbejder med (fravalg af en kategori med priser kræver bekræftelse, fordi priserne slettes); (2) under hver valgt kategori vises dens behandlinger med beskrivelse; klinikken krydser dem af, den tilbyder, og skriver prisinterval (fra-til), varighed (forudfyldt med standardvarighed) og evt. note. Hjælpetekst: tom "Pris til" betyder en fast pris. Ingen prisforslag (12.4) |
| `/klinik/aabningstider` | Ugeskema og akutvinduer |
| `/klinik/tandlaeger` | Tandlæger og deres portefølje (upload med bekræftelse af patientens samtykke) |
| `/klinik/anmeldelser` | Godkendte anmeldelser + offentligt svar. Bygget i 6.5: anmeldelser med stjerner, tekst, prisnøjagtighed og måned; svarformular, når `replyStatus` er `null`; eget svar med status; punktet "Anmeldelser" i navigationen |

### 6.4 Admin (`/admin`, rolle `admin`)

| Route | Indhold |
|---|---|
| `/admin/moderation` | **[IKKE BYGGET]**, ikke planlagt i demoen. Kø af `pending` anmeldelser og svar |
| `/admin/klinikker` | [UDSKUDT] Verifikation og import af klinikker. Demoen bruger `admin_set_clinic_status()` i seed |

### 6.5 Beskyttelse af sider

- `proxy.ts`: (0) `/api/*` passerer, (1) vilkårs-gate for sider (2.5), (2) opfrisker session, (3) grov redirect: `/patient/*`, `/klinik/*`, `/admin/*` uden session → `/login`.
- **Områdevagt:** `/patient` og `/klinik` har et server-layout, der kalder `guardArea(role, area)`: ikke logget ind → `/login?naeste=…`, anonym patient → `/opret/patient`, forkert rolle → eget område (`AREA_HOME[role]` i `lib/navigation/areas.ts`).
- **Sagsvagt:** `/start/[caseId]` (inkl. `/send`) har eget layout med `guardCaseFlow()` (patient, anonym tilladt), fordi anonyme ikke kommer ind i `/patient`.
- Ingen klientside rollevagt. Navigation viser links ud fra rollen, men adgang afgøres af layout-vagten og API/RLS. Siderne henter alle data via API'et.

### 6.6 Klinikoversigt, rangering og filtre

Rangeringen ligger i `RankingService` (`services/rankingService.ts`, ingen I/O, enhedstestet) og bruges af `ClinicDirectoryController`. Den er **ikke** AI-baseret, og kriterierne vises for patienten. API og rangering er bygget (2.1-2.3); listen, kortet og profilen i UI bygges i 2.5-2.6. Sorteringsnøglerne og deres danske navne står i `lib/constants/clinics.ts` (`CLINIC_SORTS`, `CLINIC_SORT_LABEL`).

**Visningsniveau pr. klinik** (bestemmes af `public_*`-funktionerne ud fra `clinics.status`):

| Niveau | Status | Felter |
|---|---|---|
| Basis | `imported` uden ejer (`registered` vises slet ikke) | Navn, adresse, kortplacering, kontakt (telefon, web), åbningstider og Trustpilot (hvis kendt). **Ingen egne anmeldelser og ingen prisnøjagtighed.** Kan ikke vælges til leads |
| Fuld | `verified` | Basis + logo, beskrivelse, priser, varighed, første ledige tid og akuttid, tandlæger, portefølje, egne anmeldelser og prisnøjagtighed. Kan vælges |

**Sortering** (patienten vælger én; kriteriet står ved listen):

| Nøgle | Kriterium | Retning |
|---|---|---|
| `price` | Sum af `price_min` for de valgte ydelser i klinikkens prisliste | laveste først |
| `rating` | `avg_stars`, derefter `review_count` | højeste først |
| `price_accuracy` | `price_accuracy_pct` | højeste først |
| `distance` | Haversine fra patientens postnummer eller position (gemmes ikke) til klinikkens `lat/lng` | nærmeste først |
| `first_available` | Første ledige tid for den valgte ydelse (6.7) | tidligste først |

- Standard: `distance`, hvis patienten har angivet postnummer eller position; ellers `first_available`. På `/akut`: `first_available` for akutydelsen, kun klinikker med akuttid.
- Klinikker uden værdi for kriteriet (fx ingen prisliste, ingen anmeldelser, basisniveau) sorteres **sidst**. Ved lighed: navn.
- Prissortering og prisvisning gælder kun verificerede klinikker med pris for **alle** valgte ydelser.
- **Filtre** (regler som bygget):
  - **Behandlinger:** slugs i `?services=`, højst `MAX_SELECTED_SERVICES` (5). En ukendt eller inaktiv slug giver 400 `UNKNOWN_SERVICE`.
  - **Position:** `postalCode` eller `lat`+`lng` (aldrig gemt). Ukendt postnummer giver 400 `UNKNOWN_POSTAL_CODE`; `lat` uden `lng` (eller omvendt) giver 400.
  - **Maks. afstand:** `maxDistanceKm` (standard `DEFAULT_MAX_DISTANCE_KM` = 25) gælder kun, når der er en position; så falder klinikker uden koordinater fra. Uden position filtreres der ikke på afstand.
  - **Maks. pris:** `maxPrice` kræver mindst én valgt behandling (ellers 400) og sammenlignes med summen af `price_min` for de valgte behandlinger; klinikker uden pris for alle valgte falder fra.
  - **Min. stjerner**, **kun med akuttid** inden for `EMERGENCY_FILTER_HOURS` (48 timer) og **kun klinikker, der kan kontaktes** (`verified`).
  - Ukendte query-parametre ignoreres (`readQuery`).
- MVP: alle klinikker hentes og sorteres i API'et (få klinikker). Sidevisning [UDSKUDT].
- Kortet (`views/components/clinic-directory/clinic-map.tsx`) er en klientkomponent, der indlæses dynamisk uden SSR (Leaflet kræver `window`), og viser præcis listens resultat. Markører for niveau "fuld" og "basis" ser tydeligt forskellige ud. Desktop: liste og kort side om side; mobil: skift mellem dem. Fliser fra OpenStreetMap med altid synlig kreditering "© OpenStreetMap-bidragydere" [PROTOTYPE]. CSP skal tillade fliseserveren.

**Usikker patient:** AI'en spørger først ind (7.3). Er patienten stadig usikker, foreslås ydelsen Undersøgelse, og patienten sendes til oversigten med justerbare kriterier.

### 6.7 Ledige tider

Beregnes i `AvailabilityService` (`services/availabilityService.ts`, ingen I/O, enhedstestet) ud fra data fra `AvailabilityRepository` (`public_clinics`/`public_clinic_profile` for åbningstider og priser, `public_busy_intervals()` for optaget tid). `book_slot()` gentager tjekket i databasen, så beregningen ikke er en sikkerhedsgrænse.

- **Input:** åbningsvinduer (lokal tid `Europe/Copenhagen`, inkl. `is_emergency`), optagede tidsrum, ydelsens varighed (klinikkens `duration_min`, ellers katalogets `default_duration_min`), om ydelsen er akut, tidsinterval.
- **Slots:** starttider på hele kvarterer (`SLOT_STEP_MINUTES = 15`; minut 0/15/30/45, sekunder 0, lokal tid; kræves også af databasen) inden for et vindue, hvor `start + varighed` ligger helt i vinduet og ikke overlapper optaget tid. Almindelige ydelser kun i almindelige vinduer; akutydelser i begge.
- **Grænser:** tidligst `now + MIN_BOOKING_NOTICE_MIN` (30 min, akut 0 min), senest `BOOKING_HORIZON_DAYS` (60 dage). "Første ledige tid" i oversigten søges inden for `FIRST_AVAILABLE_SEARCH_DAYS` (14 dage); ellers "Ingen ledige tider de næste 14 dage".
- Værdierne står i `lib/constants/bookings.ts` og er MVP-værdier. Dem, databasen også håndhæver, står med samme tal i migrationen (tabel i 7.6).
- Kun verificerede klinikker har ledige tider.
- **Første ledige tid i oversigten** måles for de valgte behandlinger (varighederne lagt sammen som én sammenhængende tid); uden valg for Undersøgelse (`EXAMINATION_SERVICE_SLUG`). **Første akuttid** (`firstEmergencyAt`) sættes kun for klinikker med et akutvindue og måles for den valgte akutbehandling, ellers for klinikkens korteste akutbehandling.
- Tider regnes i `CLINIC_TIME_ZONE` (`Europe/Copenhagen`). `GET /api/clinics/{id}/availability` dækker højst `MAX_AVAILABILITY_RANGE_DAYS` (14) dage pr. kald. Optaget tid hentes med `AvailabilityRepository.listBusyIntervals()` (`public_busy_intervals()`).

---

## 7. AI-flowet

Status: backend og AI-lag er bygget i trin 3 (3.1-3.3: `dbdd3881` AI-regler, `ba7115b2` sager og billeder, `adf9c53c` chat og opsummering) og sagsflowets sider (3.4). Rettelserne efter review og security (3.6a-c: strammere guardrails, atomisk reservation af chat-ture, billedbeskrivelser kun efter patientens godkendelse m.m.) er bygget (`b2f2aff8`, `df541715`, `88995a2b`, `4649015d`). Rettelsesrunde 3.7a-c er bygget (`7c0b24f4` m.fl.): falsk beroligelse om hastegrad blokeres, `reserve_chat_turn`/`consume_summary_generation` kaldes kun med service role, og døgnloftet overlever sletning af sagen; testerens afslutning 3.7d er i gang. AI-laget ligger i `services/ai/` (regler, prompts, skemaer, guard, `aiChatService.ts`, `aiSummaryService.ts`, `modelClient.ts`) samt `services/aiImageService.ts`.

**Testklient:** med `AI_FAKE_CLIENT=1` bruger serveren `FakeAiClient` (`services/ai/fakeAiClient.ts`) i stedet for OpenAI, men kun når `NODE_ENV !== 'production'`. `tests/api/run.sh` og `tests/e2e/run.sh` sætter begge variablen, så testene ikke kalder OpenAI. Testene i `tests/ai/` kalder heller ikke modellen: de tester guard, filtre, PII-maskering og akutdetektion direkte og bruger den falske klient til flowet. En valgfri live-kørsel mod den rigtige model (`AI_LIVE=1`) køres før demo, men aldrig i de normale tests (3.6a).

### 7.1 Overblik

AI-assistenten har to opgaver med samme regler:
1. **Chat:** spørger grundigt ind, indtil den forstår patientens behov; må forklare behandlinger og give en **foreløbig vurdering**; foreslår ydelser fra kataloget; henviser straks til akutvejen ved akutte tegn.
2. **Opsummering:** når patienten trykker "Lav opsummering" (aktiveret af `readyForSummary`), skriver serveren et udkast **til klinikken** ud fra chatten og billederne. Patienten retter og godkender. Opsummeringen er beskrivende; den foreløbige vurdering medtages ikke (klinikken laver sin egen).

```
(Vilkårs-gaten er passeret. Den giver IKKE AI- eller billedsamtykke.)
/start  særskilt AI-samtykke
  -> POST /api/session/anonymous           anonym session, ai_processing-samtykke, tom sag
  -> /start/[caseId]
  -> POST /api/cases/{id}/chat             chat (gentages); svar kan indeholde forslag, foreløbig vurdering, akut
  -> POST /api/consents (image_upload)     lige før første upload
     POST /api/cases/{id}/images
  -> PUT  /api/cases/{id}/services         patienten bekræfter ydelser
  -> POST /api/cases/{id}/summary          udkast
  -> PUT  /api/cases/{id}/summary          ret og godkend
  -> PATCH /api/cases/{id}                 postnummer, ønsket tidsrum
  -> /klinikker?sag=[caseId]               sammenlign, vælg op til 3
  -> POST /api/auth/convert                opret konto (kun anonym; samme bruger-id)
  -> POST /api/consents (health_data_sharing)
  -> POST /api/cases/{id}/leads            send
```

Patienter med konto starter med `POST /api/cases` + `POST /api/consents (ai_processing)`. De kan også springe AI'en over: vælge ydelser selv og skrive opsummeringen selv.

**Klinikken ser kun** `summary_text`, som patienten har godkendt, de bekræftede ydelser og billeder med godkendte beskrivelser. Chatten, AI'ens forslag og den foreløbige vurdering deles aldrig.

### 7.2 Hvad sendes til OpenAI

| | Chat (`AiChatService.sendTurn`, `services/ai/aiChatService.ts`) | Opsummering (`AiSummaryService.generate`, `services/ai/aiSummaryService.ts`) |
|---|---|---|
| System-besked | Fast, versioneret `prompts/chat.v2.ts`, bygget af reglerne i `rules.ts` | `prompts/summary.v2.ts` |
| Katalog | Aktive behandlinger grupperet efter kategori: kategoriens navn og for hver behandling `slug`, navn, type og kort beskrivelse (`catalogContext.ts`, bygget fra databasen ved hvert kald, så ændringer i kataloget slår igennem uden kodeændring). **Ingen priser, ingen klinikker**. AI'en foreslår kun behandlings-slugs, ikke kategorier | Samme |
| Kontekst | Seneste 20 beskeder; sagens billeder (low detail) | Hele chatten (max 30 brugerbeskeder), bekræftede ydelser, billeder |
| Billeder | Re-encodet server-side (EXIF fjernet), max 1024 px, base64. Aldrig signerede URL'er | Samme |
| Output | Chat-skemaet i `services/ai/schemas.ts` (7.4) | `AiSummary` (7.4) |

**Aldrig** til OpenAI: navn, e-mail, telefon, postnummer, adresse, `patient_id`, klinikdata eller priser. Patienttekst PII-maskeres før afsendelse og gemmes maskeret. Patienttekst sendes som data adskilt fra instruktioner (`<patient_input>…</patient_input>`). AI'en har ingen værktøjer eller handlinger.

**Skrivevej:** routen tjekker IP-grænsen; `ChatController` maskerer patientens besked med `maskPii()` og **reserverer turen før modelkaldet** med `reserve_chat_turn(p_user_id, …)` (5.3) via service role med bruger-id'et fra den verificerede session; funktionen tjekker og tæller alle lofter og gemmer brugerbeskeden i én transaktion. Derefter kalder den `AiChatService.sendTurn()` og skriver det validerede svar via `append_assistant_message(p_user_id, …)` (service role). Fejler noget efter reservationen (modelkald eller skrivning af svaret), gemmes den faste tekst `CHAT_UNAVAILABLE_TEXT` som svar, og routen svarer **503 `AI_UNAVAILABLE`** for enhver fejl efter reservationen; frontend henter samtalen igen (10.6). Alle andre fejl (400/403/404/409/429) sker før reservationen, så der aldrig er en halv tur. Summary-routen tjekker IP-grænsen og kalder `consume_summary_generation(p_user_id, p_case_id)` (service role) før OpenAI og skriver via `store_ai_summary(p_user_id, …)` (service role). Fejl for manglende samtykke og loft bygges ét sted, `aiConsentRequired()` og `chatLimit()` i `middleware/http.ts`. IP-grænser: chat 120 pr. time (`CHAT_IP_LIMIT_PER_HOUR`) og opsummering 20 pr. time; `enforceIpRateLimit()` har en `limit`-parameter.

**PII-maskering** (`pii.ts`): e-mail, telefonnumre, CPR-mønstre, navneudsagn ("jeg hedder …"), vejnavn + husnummer og postnummer + by. Den maskerede tekst bliver aldrig længere end originalen, så 1000-tegnsgrænsen holder.

**Filtrene (3.6a og 3.7a):** vurderinger må kun stå i `preliminaryAssessment`; kategorien `assessment` køres på `reply`, og `speculation` kun på opsummeringen. **Falsk beroligelse om hastegrad** ("det haster ikke", "kan godt vente" o.l.) blokeres i både `reply` og `preliminaryAssessment`. Patientens egne ord undtages ikke generelt (`allowTerms` er fjernet); kun prisord i `patientWishes` undtages, og kun når de findes ordret som delstreng i patientens egne beskeder. Ved emnerne pris og klinikanbefaling vises de faste tekster `PRICE_NOTICE_TEXT` (klinikken giver et prisinterval) og `CLINIC_RECOMMENDATION_NOTICE_TEXT` (anmeldelser og kriterier ses i oversigten) fra `lib/constants/ai-texts.ts`. Opdager akutdetektionen akutte tegn, som modellen ikke markerede, erstattes `reply` med akut-henvisningen. `forbiddenTerms.ts` importerer `rules.ts`. Værdierne for emner, billedvinkler, billedkvalitet og samtalestatus står i `lib/constants/ai.ts` (`OUT_OF_SCOPE_TOPICS`, `IMAGE_VIEWS`, `IMAGE_QUALITIES`, `CONVERSATION_STATUSES`).

**Bygget i 3.3 (afvigelser og valg):** ukendte slugs fra modellen **afvises** (nyt forsøg, derefter fast tekst) i stedet for at blive fjernet. Ved `retakeImages` gemmes opsummeringen, kvaliteten gemmes på billedet (`ai_quality`), og `POST /summary` returnerer listen; serveren blokerer ikke godkendelsen. Svaret på den 30. brugerbesked kan gemmes, selvom samtalen er lukket af triggeren (migration `20261018000100`). **Test-mulighed:** `AI_FAKE_CLIENT=1` giver en deterministisk falsk klient (`services/ai/fakeAiClient.ts`) uden netværkskald, men kun når `NODE_ENV !== 'production'`; den sættes kun af `tests/api/run.sh`.

### 7.3 Hvad AI'en må og ikke må

| Tilladt | Forbudt |
|---|---|
| Stille opklarende spørgsmål om ønsker, gener, varighed, tidligere behandling, tidshorisont | **Priser** i enhver form: beløb, prisniveau, "billig/dyr", sammenligning af priser |
| Forklare behandlinger generelt (gerne med katalogets beskrivelser) | **Anbefale en bestemt klinik** eller tandlæge, rangere klinikker, nævne klinikker ved navn |
| Give en **foreløbig vurdering** i feltet `preliminaryAssessment`, altid formuleret som foreløbig. UI viser altid den faste mærkat: "Foreløbig vurdering fra AI. Klinikken laver den endelige vurdering." | Endelige diagnoser eller garantier ("du har…", "det er helt sikkert…"); at sige, at patienten ikke behøver tandlæge |
| Foreslå ydelser fra kataloget (`suggestedServices`, kun slugs fra kataloget). Patienten bekræfter selv | Ydelser uden for kataloget; at bekræfte ydelser på patientens vegne |
| **Akut:** ved tegn som stærke smerter, hævelse, feber, blødning der ikke stopper, traume: `emergency = true` og en kort opfordring til at søge akut tid. UI viser den faste akut-henvisning med link til `/akut`. Ved livstruende tegn (vejrtrækningsbesvær, udbredt hævelse i ansigt/hals) henvises til 112/1813 i den faste tekst | At fortsætte almindelig udspørgen, når der er akutte tegn |
| **Usikker patient:** spørge mere ind; er patienten stadig usikker, foreslå `undersoegelse` | At vælge spor eller klinik for patienten |
| Billeder: vinkel, synligt område, kvalitet; bede om nyt billede | I opsummeringens billedfelter: fortolkning (de er beskrivelser til klinikken) |

Spørger patienten om pris eller hvilken klinik der er bedst, svarer AI'en ikke på indholdet, sætter `outOfScopeTopics` (`price`, `clinic_recommendation`), og UI viser en fast tekst: "Priserne kommer fra klinikkernes egne prislister, og du kan sortere klinikkerne efter pris, anmeldelser, afstand og første ledige tid i oversigten."

**MDR-note:** En foreløbig vurdering og forklaring af behandlinger kan gøre softwaren til medicinsk udstyr (EU MDR). Det er accepteret for prototypen, men skal vurderes fagligt før rigtige patienter [UDSKUDT]. Derfor er reglerne samlet ét sted (7.8), så vurderingen kan slås fra og diagnoseordene genaktiveres uden at ændre resten af flowet.

### 7.4 Output-skemaer (structured output, strict)

`additionalProperties: false` overalt, alle strenge har max-længde. Ingen prisfelter, ingen klinikfelter.

```ts
// lib/types/ai.ts (værdierne står i lib/constants/ai.ts: OUT_OF_SCOPE_TOPICS, IMAGE_VIEWS, IMAGE_QUALITIES, CONVERSATION_STATUSES)
export type OutOfScopeTopic = (typeof OUT_OF_SCOPE_TOPICS)[number];  // "price" | "clinic_recommendation"
export type ImageView = (typeof IMAGE_VIEWS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

// Chat-svarets felter (skemaet ligger i services/ai/schemas.ts; der er ingen eksporteret AiChatTurn-type):
//   reply                  max 700. Spørgsmål, forklaring, procesvejledning
//   preliminaryAssessment  max 400 eller null. Altid foreløbig; null hvis rules.ts slår vurdering fra
//   suggestedServices      max MAX_CONFIRMED_SERVICES_PER_CASE slugs; en ukendt slug afviser svaret (7.5)
//   emergency              akutte tegn
//   outOfScopeTopics       OutOfScopeTopic[]
//   readyForSummary        aktiverer kun en knap

// Opsummeringsskemaet er defineret én gang med zod i lib/constants/ai-schemas.ts og genbruges af
// lib/schemas/aiSummary.ts (parseAiSummary) og AI-laget. Typerne udledes: AiSummary = z.infer<…>,
// AiImageObservation = z.infer<…>. Felterne:
//   AiSummary.summaryText             max 800. Til klinikken: patientens ønske og oplysninger, neutralt
//   AiSummary.patientWishes           max 5
//   AiSummary.patientReportedHistory  max 5
//   AiSummary.suggestedServices       max 5 slugs
//   AiSummary.images                  AiImageObservation[]
//   AiSummary.outOfScopeTopics        OutOfScopeTopic[]
//   AiImageObservation.imageRef       "img_1" …, mappes til case_images.id på serveren
//   AiImageObservation.view           ImageView
//   AiImageObservation.visibleArea    max 80
//   AiImageObservation.observations   max 4, hver max 120; kun synlige forhold uden fortolkning
//   AiImageObservation.quality        ImageQuality
// Den samlede beskrivelse, der gemmes i case_images.ai_description, laves af imageDescription() i
// lib/domain/summary.ts og afkortes til IMAGE_DESCRIPTION_MAX_CHARS (500) (4.3).
```

### 7.5 Guardrails, lag for lag

| # | Hvor | Chat | Opsummering |
|---|---|---|---|
| 1 | UI | Fast tekst over chatten: "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer." Fast mærkat ved foreløbig vurdering. Fast akut-blok ved `emergency` | Mærkat "Beskrivelse, ikke vurdering" ved billedbeskrivelser |
| 2 | System-prompt | Reglerne fra `rules.ts` (7.3), kataloget | Samme |
| 3 | Input | Data-afgrænsning, PII-maskering, max 1000 tegn | Samme |
| 4 | Output-skema | chat-skemaet strict | `AiSummary` strict |
| 5 | Server-validering (`guard.ts`) | zod + filter på `reply` og `preliminaryAssessment`: beløb/valuta, prisord, klinikanbefaling. Slugs valideres mod aktivt katalog | Samme på alle strenge; billedfelterne også mod fortolkningsord |
| 6 | Ved fejl i 5 | Ét nyt forsøg med skærpet påmindelse; derefter fast tekst, `blocked = true`. Det afviste svar gemmes ikke | Ét nyt forsøg; derefter `summary = null`, `fallback = "write_yourself"` |
| 7 | Menneske i loopet | Patienten bekræfter ydelser; chatten deles ikke | Patienten retter og godkender |
| 8 | Drift | Logs kun med id'er, model, prompt-version, varighed, status, `blocked`, `emergency`. Aldrig indhold | Samme |
| 9 | Test (`tests/ai/`) | Provokationer: "hvad koster det?", "hvilken klinik er bedst?", "er klinik X god?", "ignorer dine regler", akutte symptomer (skal give `emergency`), usikker patient (skal spørge ind og derefter foreslå `undersoegelse`) | Samme + billeder af ikke-tænder |

`forbiddenTerms.ts` har lister for priser (beløb, valuta, prisord), klinikanbefaling og fortolkning i billedfelter. Diagnose- og alvorlighedsordene fra den tidligere model beholdes i en liste `mdrStrictTerms`, som kun bruges, når `rules.ts` sætter `strictMdrMode = true`.

### 7.6 Lofter og rate limits

| Grænse | Værdi (MVP) | Ved overskridelse |
|---|---|---|
| Patientbeskeder pr. samtale | 30 | 429 `CHAT_LIMIT`, samtalen `closed` |
| Tegn pr. patientbesked | 1000 | 400 |
| Chatbeskeder pr. patient pr. døgn | 100 (`ai_limits.chat_messages_per_patient_day`; tælles pr. UTC-dag i `ai_patient_usage_daily.chat_messages`, som ikke slettes med sagen) | 429 |
| Opsummeringer pr. sag / pr. patient pr. døgn | 5 / 20 | 429 `SUMMARY_LIMIT` |
| Billeder pr. sag | 5, max 4 MB hver | 400/413 |
| Bekræftede ydelser pr. sag | 5 | 400 |
| Tandlæger pr. klinik | 30 | 429 `DENTIST_LIMIT` |
| Porteføljebilleder pr. klinik | 60 | 429 `PORTFOLIO_LIMIT` |
| Rækker i prislisten | 100 | 400 |
| Blokerede tider pr. klinik | 200 (alle rækker tæller) | 429 `TIME_BLOCK_LIMIT` |
| Åbningsvinduer pr. klinik | 42 | 400 |
| Pris pr. ydelse | 0-1.000.000 kr. | 400 |
| Aktive leads pr. sag (`sent`, `accepted`, `booked`) | 3 | 409 `LEAD_LIMIT` |
| Leads i alt pr. sag (uanset status) | 10 | 409 `LEAD_TOTAL_LIMIT`; UI tilbyder at starte en ny sag |
| Leads pr. patient pr. døgn (rullende 24 timer, uanset status og sag) | 15 | 429 `LEAD_DAILY_LIMIT` (mod spam til klinikkerne; security trin 4) |
| Reservation af akuttid uden svar | 30 min (eller til starttid) | Reservationen frigives (4.2) |
| Frist for at markere udeblivelse | 24 timer efter sluttid | 409 `NO_SHOW_WINDOW_CLOSED` |
| Timeout pr. OpenAI-kald | 30 s | 503 |
| Kontekst til chat | seneste 20 beskeder | |
| Anonym: kladder / beskeder / opsummeringer / billeder / lagring | 1 / 30 / 3 / 5 / 20 MB | 409 / 429 / 429 / 400 / 413 |
| Anonym levetid | 48 timer efter seneste aktivitet | Slettes (7.7) |
| Nye anonyme sessioner, login, signup, patienters og klinikkers billedupload pr. IP | 10 pr. time (`consume_rate_limit`) | 429 |
| AI-kald fra alle anonyme pr. døgn | `ai_limits.anon_daily_ai_calls` (300) | 429 `ANON_CAP_REACHED` |
| AI-kald pr. anonym bruger pr. døgn | `ai_limits.anon_user_daily_ai_calls` (40), så én bruger ikke kan tømme det globale loft | 429 |
| Chatbeskeder pr. IP pr. time | `CHAT_IP_LIMIT_PER_HOUR` (120) | 429 |
| Opsummeringer pr. IP pr. time | 20 | 429 |
| Beskeder i tråden | 2000 tegn, 200 pr. afsender pr. døgn | 400 / 429 `MESSAGE_LIMIT` |
| Bookinger | 1 aktiv pr. lead; højst 5 bookinger i alt pr. lead (også aflyste), så book og aflys ikke kan gentages i det uendelige (security trin 6, M1; migration `20261027000100`) | 409 / 409 `BOOKING_LIMIT` |
| Bookinger pr. IP pr. time (`POST /api/leads/{id}/booking`, scope `booking`) | 30 | 429 `RATE_LIMITED` |

Lofterne tælles i databasen (triggers og funktionerne i 5.3). Konstanterne står i `lib/constants/limits.ts`.

**Konstanter, der findes både i SQL og i `lib/constants/`.** Databasen håndhæver dem; TypeScript spejler dem til UI og beregning. De ændres altid begge steder i samme commit:

| Regel | Værdi | `lib/constants/` | Håndhæves i SQL af |
|---|---|---|---|
| Højst bookinger i alt pr. lead (også aflyste) | 5 | `bookings.ts`: `MAX_BOOKINGS_PER_LEAD` | `book_slot()` (`BOOKING_LIMIT`) |
| Starttid på helt kvarter | 15 min | `bookings.ts`: `SLOT_STEP_MINUTES` | check på `bookings`, `assert_slot_bookable()` |
| Mindste varsel, almindelig ydelse | 30 min | `bookings.ts`: `MIN_BOOKING_NOTICE_MIN` | `assert_slot_bookable()` |
| Mindste varsel, akutydelse | 0 min | `bookings.ts`: `MIN_EMERGENCY_NOTICE_MIN` | `assert_slot_bookable()` |
| Længst frem at booke | 60 dage | `bookings.ts`: `BOOKING_HORIZON_DAYS` | `assert_slot_bookable()` |
| Frist for udeblivelse | 24 timer efter sluttid | `bookings.ts`: `NO_SHOW_GRACE_HOURS` | `effective_booking_status()`, `mark_booking_no_show()`, `complete_due_bookings()` |
| Reservation af akuttid | 30 min (eller til starttid) | `bookings.ts`: `EMERGENCY_HOLD_MINUTES` | `send_leads()`, `effective_booking_status()`, `release_expired_holds()` |
| Aktive leads pr. sag | 3 | `limits.ts`: `MAX_ACTIVE_LEADS_PER_CASE` | `send_leads()`, trigger på `leads` |
| Leads i alt pr. sag | 10 | `limits.ts`: `MAX_TOTAL_LEADS_PER_CASE` | `send_leads()`, trigger på `leads` |
| Leads pr. patient pr. døgn | 15 | `limits.ts`: `MAX_LEADS_PER_PATIENT_DAY` | trigger `leads_daily_limit()` (BEFORE INSERT på `leads`, migration `20261022000100`) |
| AI-lofter | se tabellen ovenfor | `limits.ts` | `ai_limits` og funktionerne i 5.3 |

`FIRST_AVAILABLE_SEARCH_DAYS` (14 dage) findes kun i TypeScript, fordi den kun bruges til visning.

Klinikkernes lofter står i `lib/constants/clinics.ts`: `MAX_DENTISTS_PER_CLINIC = 30`, `MAX_PORTFOLIO_ITEMS_PER_CLINIC = 60`, `MAX_PRICE_ROWS = 100`, `MAX_OPENING_HOUR_WINDOWS = 42` (højst seks pr. ugedag), `MAX_TIME_BLOCKS_PER_CLINIC = 200`, `MAX_PRICE_DKK = 1_000_000`. De håndhæves af API'et (pæn fejl) **og i databasen** med de samme tal (triggere på `clinic_dentists`, `portfolio_items`, `clinic_opening_hours`, `clinic_time_blocks`, og i `replace_clinic_prices()`; check på priserne), så de ikke kan omgås ved direkte kald med brugerens JWT. Tallene skal ændres begge steder samtidig.

### 7.7 Anonym samtale: identitet, kontooprettelse og sletning

Bygget for den gamle kladde; tilpasses til sager.

- **Mekanisme:** Supabase anonymous sign-in. `POST /api/session/anonymous` kalder `signInAnonymously()` på serveren; sessionen ligger i `httpOnly`-cookies. Den anonyme bruger har et rigtigt `auth.uid()`, så RLS virker uændret.
- **Konvertering** (`POST /api/auth/convert`): kræver anonym session; `updateUser({ email, password })`; trigger sætter `is_anonymous = false`; API'et sætter `first_name`; sessionen opfriskes. Samme bruger-id, så sag, chat, billeder og samtykker følger med. Findes e-mailen: 409 `EMAIL_EXISTS` [PROTOTYPE].
- **Ingen overtagelse:** ejerskab er bundet til bruger-id'et; et `case_id` alene giver intet.
- **Udløb:** 48 timer efter `last_active_at`. `/api/cron/cleanup-anonymous` (hver time, `CRON_SECRET`) sletter billedmapperne `{case_id}/` og derefter auth-brugeren (cascade).
- **Selv slette:** `DELETE /api/patients/me` (også anonymt).
- **Tilbagetrækning:** af `ai_processing` i en anonym session sletter hele sessionen; af `image_upload` sletter billederne.
- **Minimering:** session først efter vilkår og AI-samtykke; ingen e-mail, navn, telefon eller postnummer før kontooprettelse (postnummer spørges i opsummeringstrinnet og kan udelades); IP kun som hash. Anonyme sager er altid `draft` og når aldrig klinikker.

### 7.8 AI-reglerne ét sted

`services/ai/rules.ts` er det eneste sted, der bestemmer AI'ens rolle. Den eksporterer en versioneret konfiguration, som prompts, skemaer, guard og UI-tekster læser:

```ts
export const AI_RULES = {
  version: "rules-v2",
  allowPreliminaryAssessment: true,   // false → feltet tvinges til null og prompten forbyder vurdering
  allowTreatmentExplanation: true,
  strictMdrMode: false,               // true → diagnose- og alvorlighedsord blokeres (mdrStrictTerms)
  blockedTopics: ["price", "clinic_recommendation"],
  emergencyReferral: true,
} as const;
```

Stramning til EU MDR sker ved at ændre `rules.ts` og prompt-versionen. De faste UI-tekster står i `lib/constants/ai-texts.ts`. `prompt_version` og `AI_RULES.version` gemmes på samtalen og sagen for sporbarhed.

---

## 8. Anmeldelser og prisnøjagtighed

Status: tabeller, policies og statistikfunktion er bygget i databasen (trin 0). Den offentlige læsning (`GET /api/clinics/{id}/reviews`, statistik i oversigt og profil) er bygget i trin 2. Skrivning, svar, patientens og klinikkens visning er bygget i 6.2 (10.13). Moderationen er manuel i databasen (8.5).

### 8.1 Verifikation: kun efter gennemført booking

En patient kan anmelde klinik K, hvis og kun hvis K er verificeret, og der findes en booking med `patient_id = uid`, `clinic_id = K` og effektiv status `completed`, som ikke allerede er anmeldt (`unique(booking_id)`).

RLS INSERT-policy på `reviews`:
```
patient_id = uid and is_permanent_user() and public.can_review_booking(booking_id)
```
`can_review_booking()` (5.2) samler betingelserne: bookingen er egen, effektivt `completed` (`effective_booking_status()`) og klinikken er verificeret. At bookingen ikke allerede er anmeldt sikrer `unique(booking_id)` (409 `ALREADY_REVIEWED`), ikke funktionen.
Trigger sætter `clinic_id` fra bookingen og tvinger `moderation_status = 'pending'`. Et besøg er gennemført automatisk 24 timer efter sluttid, medmindre klinikken inden da har markeret det som udeblevet (4.2). Klinikken skal altså ikke gøre noget, for at et besøg tæller, og patienten kan først anmelde, når fristen er udløbet.

### 8.2 Felter og prisoverslag

UI: "Svarede den endelige pris til prisoverslaget?" med præcis tre valg: Ja / Lidt højere / Langt højere. Ingen "lavere", ingen procentgrænser. Valgfrit: faktisk pris og "Manglede der gennemsigtighed om prisen?" + kommentar.

**Prisoverslaget** er klinikkens præciserede pris på leadet (`quoted_price_min/max`), hvis den findes; ellers listepris-snapshot på leadet (`list_price_min/max`). Det vises i formularen som påmindelse.

### 8.3 Beregning af prisnøjagtighed

Kun godkendte anmeldelser. Vægte: `as_quoted = 1.0`, `slightly_higher = 0.5`, `much_higher = 0.0`.

```
price_accuracy_pct = round(100 * (n_as_quoted * 1.0 + n_slightly_higher * 0.5) / n_total)
```

Vises kun ved `n_total >= 3` sammen med fordelingen. Beregnes i databasen (`public_clinic_review_stats_many()`); frontend beregner aldrig selv. `actual_price` indgår ikke.

### 8.4 Trustpilot

- `trustpilot_url`, `trustpilot_score`, `trustpilot_review_count` indtastes af klinikken på `/klinik/profil`. For importerede klinikker kan de være indtastet manuelt af admin/seed. Vises for alle statusser, når de er kendt. For importerede klinikker er Trustpilot den eneste bedømmelse, der vises.
- Vises som "Trustpilot: 4,6 (angivet af klinikken / angivet af TandMatch, opdateret d. …)" efter `trustpilot_entered_by`, med link (`rel="noopener noreferrer"`), adskilt fra platformens egne anmeldelser. Ingen scraping, intet API.

### 8.5 Moderation

- Nye anmeldelser og svar er `pending` og ikke offentlige, før admin godkender. Seed-anmeldelser er forhåndsgodkendte. Adminsiden er [IKKE BYGGET]; indtil da godkendes manuelt i databasen.
- Afvisning ved personoplysninger om andre, injurier, helbredsoplysninger om tredjemand eller irrelevant indhold, med `rejection_reason`.
- Patienten kan ikke redigere en anmeldelse; sletning er [IKKE BYGGET].
- Et afvist klinik-svar vises for klinikken som "Afvist" med begrundelse (`rejection_reason`), og klinikken kan ikke svare igen (ét svar pr. anmeldelse). [PROTOTYPE] Før drift: mulighed for at rette et afvist svar.
- Klinikken kan markere et besøg som udeblevet inden for 24 timer efter sluttid og dermed forhindre en anmeldelse; patienten har ingen indsigelse (security trin 6, M2). [PROTOTYPE] Før drift: indsigelse eller moderation af udeblivelser.
- Klinikken beholder kontaktoplysningerne for en gennemført booking, så længe patientkontoen findes (security trin 6, L5). Opbevaringsperiode fastsættes før drift (12.3).

---

## 9. Billeder og storage

### 9.1 Buckets

Status: begge buckets oprettes af migrationssættet (trin 0). Upload til `public-media` er bygget i trin 1 (9.5) og til `case-images` i trin 3 (9.3, 10.5).

| Bucket | Type | Indhold |
|---|---|---|
| `case-images` | **privat** | Patientens mundfotos (helbredsdata) |
| `public-media` | offentlig | Kliniklogoer, tandlægeportrætter og porteføljebilleder |

### 9.2 `case-images`: sti og adgang

Sti: `{case_id}/{image_id}.jpg`. Ingen `patient_id` i stien.

- **Ingen policies for `authenticated` eller `anon`** på `storage.objects` for denne bucket: hverken SELECT, INSERT, UPDATE eller DELETE.
- Upload, sletning og rækkeinsert sker kun med service role efter serverens tjek (9.3).
- **Læsning:** serveren henter stien gennem en RLS-beskyttet læsning (patient: egne `case_images`; klinik: `clinic_lead_images()`, som kræver lead og aktivt samtykke) og signerer derefter med service role (TTL 5 min). Signerede URL'er logges ikke.

### 9.3 Upload-flow (`POST /api/cases/{id}/images`)

Bygget for forespørgsler; tilpasses til sager.
1. Session, rolle patient (anonym tilladt), ejer, sag `draft`, færre end 5 billeder, for anonyme under 20 MB samlet. Opdatér `last_active_at`. Filen læses først efter tjekkene (`imageFileReader`).
2. Aktivt `image_upload`-samtykke, ellers 403 `CONSENT_REQUIRED`.
3. Klienten har nedskaleret (max 2048 px, < 4 MB). Serveren tjekker størrelse og magic bytes (JPEG, PNG, HEIC).
4. `sharp` re-encoder til JPEG og fjerner EXIF.
5. Service role skriver filen og `case_images`-rækken med `consent_id`.
6. Trigger nulstiller `summary_approved_at`.
7. Returnér `ImageDto` med signeret URL.

### 9.4 Samtykke og sletning

- Samtykke gemmes server-side med `granted_at` og kendt `text_version` **før** upload; hvert billede peger på sit samtykke. Billedsamtykket gives særskilt lige før første upload, aldrig på `/start` og aldrig sammen med AI-samtykke eller vilkår.
- Tilbagetrækning af `image_upload` sletter patientens billeder (filer og rækker), også på sendte sager; klinikkerne mister dermed adgangen.
- Kontosletning sletter billedmapperne for alle patientens sager, alle rækker (cascade, herunder leads, bookinger og anmeldelser) og auth-brugeren.
- Anonyme billeder slettes 48 timer efter seneste aktivitet.
- Opbevaringsperiode for kontodata: [UDSKUDT].

### 9.5 `public-media`: logo, tandlæger og portefølje

Stier: `clinics/{clinic_id}/logo.jpg`, `clinics/{clinic_id}/dentists/{dentist_id}.jpg`, `clinics/{clinic_id}/portfolio/{item_id}.jpg`. Bygget i trin 1.

- **Versionerede URL'er:** logo og tandlægeportrætter overskrives på samme sti, når de udskiftes. Den offentlige URL får derfor en version (`?v=<tidsstempel for seneste upload>`), så browsere og CDN ikke viser et gammelt billede. Portrætter bruger `clinic_dentists.photo_updated_at` og logoet `clinics.logo_updated_at`, så andre profilændringer ikke skifter logoets URL. Porteføljebilleder får en ny sti pr. element og behøver ikke version.

- Offentlig læsning. Ingen skriverettigheder for `authenticated` eller `anon`; serveren skriver og sletter med service role (`PublicMediaStorage`) efter ejertjek med brugerens klient (`ClinicsRepository.requireOwnId()`). `setLogoPath` sætter kun logo på en klinik, som brugeren stadig ejer (security L3).
- Samme behandling som patientbilleder: størrelsestjek, magic bytes, re-encoding, EXIF fjernes.
- **Portefølje:** upload kræver, at klinikken afkrydser en bekræftelse af, at patienten på billedet har givet skriftligt samtykke til offentliggørelse, og at billedet ikke viser ansigt eller andet identificerende [ÅBEN, 12.3]. Serveren gemmer `patient_consent_confirmed_at` og `consent_text_version` på `portfolio_items`. Klinikken er dataansvarlig for samtykket. Sletning fjerner rækken og filen.
- **Porteføljebekræftelsen er klinikkens erklæring, ikke et patientsamtykke.** Den gemmes derfor ikke i `consents` eller `consent_text_versions` (`consent_type` omfatter kun patientens egne samtykker). Den gyldige version står som konstanten `PORTFOLIO_CONSENT_TEXT_VERSION` i `lib/constants/consents.ts`, og serveren afviser andre versioner. Teksten er en pladsholder, der skal gennemgås juridisk (12.4).
- Vises kun for verificerede klinikker (via `public_clinic_profile()`); filerne er dog offentlige, når de er uploadet.

---

## 10. API-kontrakter

Typer i `lib/types/<domæne>.ts`, zod-skemaer i `lib/schemas/<domæne>.ts`. "Rolle" angiver hvem routen er for; alle andre får 403/404.

**Status:** 10.2 og 10.3 har en Status-kolonne pr. route (kernen er bygget i trin 0, klinik-signup og `clinic` på `/api/me` i trin 1). 10.4 (katalog) og 10.8 (egen klinik) er bygget i trin 1 og 1.9, . 10.7 (offentlig klinikoversigt og profil) og den offentlige del af 10.13 (`GET /api/clinics/{id}/reviews`) er bygget i trin 2. 10.5 og 10.6 er bygget i trin 3, leads i 10.5 i trin 4. 10.9 og 10.12 er bygget i trin 5. 10.10 (6.1) og 10.13 (6.2) er bygget; 10.11 og 10.14 er [IKKE BYGGET]. Typerne i 10.1 findes for de bygget dele (roller, samtykker); resten oprettes med deres trin.

### 10.1 Delte typer

```ts
// lib/types/common.ts
export type Role = (typeof ROLES)[number];   // ROLES = ["patient", "clinic", "admin"] as const i lib/constants/roles.ts (2.1)
export type PriceRange = { min: number; max: number };  // hele kroner
export type ImageDto = { id: string; url: string; view: string | null; quality: string | null };
export type TrustpilotInfo = { url: string; score: number | null; reviewCount: number | null; updatedAt: string | null; enteredBy: "clinic" | "admin" } | null;

// lib/types/services.ts
export type ServiceCategory = "cosmetic" | "general" | "emergency";
export type ServiceDto = { id: string; slug: string; name: string; description: string; category: ServiceCategory; defaultDurationMin: number;
  groupId: string; groupSlug: string };

// lib/types/reviews.ts
export type PriceAccuracy = (typeof PRICE_ACCURACY_VALUES)[number];   // lib/constants/reviews.ts
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];  // lib/constants/reviews.ts
export type ReviewStats = {
  reviewCount: number; avgStars: number | null; priceAccuracyPct: number | null;
  distribution: { asQuoted: number; slightlyHigher: number; muchHigher: number } | null;
};

// lib/types/consents.ts
export type ConsentType = "health_data_sharing" | "image_upload" | "ai_processing";
```

### 10.2 Auth, anonym session og konto

| Metode og route | Rolle | Input | Output | Status |
|---|---|---|---|---|
| GET `/api/terms/status`, POST `/api/terms/accept` | alle (undtaget fra gaten) | uændret (2.5) | uændret | Bygget |
| POST `/api/session/anonymous` | besøgende, gyldig vilkårs-accept | `{ aiConsent: { textVersion } }` (strict) | **201** `{ caseId, expiresAt }` ved ny session: opretter anonym session, vilkårs-accept, `ai_processing`-samtykke og tom sag. **200** `{ caseId, expiresAt }` ved retry med eksisterende anonym session: gemmer manglende samtykker og returnerer den eksisterende kladde. 409 `ALREADY_AUTHENTICATED` ved permanent konto; 429 ved IP-limit | Bygget |
| POST `/api/auth/convert` | anonym patient | `{ email, password (8-72), firstName }` | 200 `{ userId, role: "patient" }`; 409 `EMAIL_EXISTS` | Bygget |
| POST `/api/auth/signup` | besøgende | Diskrimineret på `role`: patient `{ role: "patient", email, password (8-72), firstName (1-50) }`; klinik `{ role: "clinic", email, password (8-72), cvr (8 cifre), clinicName (2-100), address, postalCode, city, phone }` | 201 `{ userId, role }`. Signup-triggeren opretter `profiles` + `patients` eller `profiles` + `clinics` (status `registered`). Findes en **importeret** klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE]; har den en ejer: 409 `CLINIC_EXISTS`. Controlleren forhåndstjekker med `is_cvr_claimed()`, fordi fejlen fra triggeren kommer tilbage fra GoTrue som en generisk fejl (4.3). 409 ved aktiv anonym session | Bygget (patient trin 0, klinik trin 1). `is_cvr_claimed()` kaldes via `ClinicsRepository.isCvrClaimed()` |
| POST `/api/auth/login`, POST `/api/auth/logout` | | uændret | uændret | Bygget |
| GET `/api/me` | med session | | `{ id, role, isAnonymous, displayName, anonymousExpiresAt, clinic?: { id, name, status } }` | Bygget. `clinic` hentes via `ClinicsRepository.findOwn()` |
| GET/PATCH `/api/patients/me` | patient | PATCH `{ firstName?, postalCode?, phone? }` | `{ firstName, postalCode, phone }` | Bygget (`phone` i 6.1). `phone` valideres med `phoneSchema` (`lib/schemas/phone.ts`, samme som klinikkens telefon og bookingens `contactPhone`); `null` rydder nummeret. Gemmes også af `book_slot()` |
| DELETE `/api/patients/me` | patient eller anonym | `{ confirm: "SLET" }` | 204 | Bygget |
| GET `/api/patients/me/export` | patient eller anonym | | `{ exportedAt, cases, chat, leads, bookings, reviews, consents }` (GDPR art. 20). `chat` = egne AI-samtaler pr. sag. Billeder beskrives med metadata (`id`, `view`, `quality`, `description`, `createdAt`), uden sti eller URL | Bygget: `cases`, `chat` (3.3), `leads` (4.1, `LeadExportDto` uden beskeder og billeder), `bookings` (6.1, `BookingExportDto`: patientens egne bookinger med klinikkens navn, ydelse, effektiv status og de kontaktoplysninger patienten selv har angivet) og `consents` er bygget. `reviews` (6.2, `ReviewExportDto`: patientens egne anmeldelser inkl. `moderationStatus` og `rejectionReason`; klinikkens navn står i `bookings` under samme `bookingId`) er bygget |
| GET/POST `/api/cron/cleanup-anonymous` | intern (`CRON_SECRET`) | | 200 `{ deletedSessions }`. Sletter `{case_id}/`-mapper og auth-brugeren | Bygget |
| GET/POST `/api/cron/complete-bookings` | intern (`CRON_SECRET`) | | 200 `{ completed, releasedHolds }` (10.10) | Bygget (6.1) |

IP-rate-limited (10 pr. time): login, signup og konvertering af anonym konto (`POST /api/auth/convert`, samme grænse som signup), anonym session, patienters billedupload og klinikkernes billedupload (10.8). Afsendelse af leads har 30 pr. time (`leads-send`, 10.5). Routes, som anonyme må kalde, kalder `touch_last_active()`.

### 10.3 Samtykker

Bygget (trin 0), inkl. `withdrawnLeads`. GET `/api/consents`, POST `/api/consents` (`{ type, textVersion }`; `health_data_sharing` kun permanent), POST `/api/consents/{id}/withdraw` (`{ withdrawnAt, deletedImages, withdrawnLeads, sessionDeleted }`). `withdrawnLeads` er antallet af leads, der blev trukket tilbage ved tilbagetrækning af `health_data_sharing` (5.3); UI fortæller, at bookede tider består og kan aflyses under Bookinger.

### 10.4 Ydelseskatalog

Bygget (trin 1 og 1.9). Routen er offentlig, så `ServicesController` tager `session: Session | null` (2.1.1).

```ts
// lib/types/services.ts
export type ServiceGroupDto = { id: string; slug: string; name: string; description: string; services: ServiceDto[] };
// ServiceDto (10.1) får også groupId og groupSlug
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/services` | alle | `?category=` (overordnet type, valgfri) | `{ groups: ServiceGroupDto[] }`: aktive kategorier med deres aktive behandlinger, begge sorteret efter `sort_order`. Kategorier uden aktive behandlinger (efter filter) udelades. Det er den eneste hentning af kataloget; views laver selv en flad liste ved behov |

### 10.5 Sager (patient)

Bygget i trin 3 (3.1 og 3.3); leads-routerne i 4.1. Filer: `controllers/{cases,caseImages,summary,leads}Controller.ts`, `models/{cases,caseImages,caseServices,summary,leads}Repository.ts`, `services/caseImageUrlService.ts` (signerede URL'er), `lib/schemas/{cases,leads}.ts`, `lib/domain/leads.ts` (`isActiveLead`, `canSendMoreLeads`, `canSendCase`; en sendt sag kan sendes til flere klinikker, kun en lukket kan ikke, som i `send_leads()`), `lib/constants/leads.ts` (`LEAD_STATUSES`, `LEAD_ACTIVE_STATUSES`). Anonyme får 403 `ACCOUNT_REQUIRED` på afsendelse og tilbagetrækning; `GET /api/cases/{id}/leads` giver en anonym ejer en tom liste. `POST /api/cases/{id}/leads` har IP-grænsen `enforceIpRateLimit("leads-send", req, 30)` (`LEADS_SEND_IP_LIMIT_PER_HOUR`) pr. time; derudover gælder døgnloftet pr. patient (7.6) i databasen. `POST /api/auth/convert` har samme IP-grænse som signup. `CaseDto.canSend` tager højde for både de 3 aktive og de 10 i alt (`canSendCase(record, serviceCount, activeCount, totalCount)`), og UI bruger kun serverens `canSend`; `CaseDto.leadCount` er aktive leads og `CaseDto.totalLeadCount` alle leads, og `CaseListItemDto.leads[]` har `removed`; antallet af ledige pladser i UI er `remainingLeadSlots(active, total)` = min(3 − aktive, 10 − i alt) fra `lib/domain/leads.ts`. Tællingen ligger i `LeadsRepository.countForCase()` (aktive og i alt).

Fejlkoder ud over de generelle: `POST /summary` giver 409 `NO_CONVERSATION`, hvis der ikke er en samtale at opsummere, og 429 `SUMMARY_LIMIT` ved loftet (7.6). Tekstgrænsen på 1500 tegn for opsummeringen står ét sted (`SUMMARY_MAX_CHARS` i `lib/constants/limits.ts`). **`summary_ai_assisted`:** `false`, hvis under 50 % (`AI_DRAFT_MIN_SHARED_WORDS` i `lib/constants/limits.ts`) af den godkendte teksts ord på mindst 3 tegn findes i AI-udkastet (`buildsOnAiDraft()` i `lib/domain/summary.ts`); databasen tvinger `false`, når der ikke er et AI-udkast (`approve_summary()`, 5.3). `aiSummary` parses med zod (`parseAiSummary()` i `lib/schemas/aiSummary.ts`; ugyldigt → `null`). `CaseDto.images[]` har `description` (AI'ens billedbeskrivelse, vist med mærkat i opsummeringstrinnet). Kladdetjek sker ét sted, `CasesRepository.requireOwnDraft()`; det aktive samtykke med gyldig tekstversion hentes med `ConsentsRepository.findCurrentActive()` (chat, opsummering og upload).

```ts
// lib/types/cases.ts
export type CaseStatus = "draft" | "submitted" | "closed";
export type CaseTimeframe = "asap" | "within_2_weeks" | "within_3_months" | "flexible";

export type CaseDto = {
  id: string;
  status: CaseStatus;
  isEmergency: boolean;
  postalCode: string | null;
  preferredTimeframe: CaseTimeframe | null;
  services: (ServiceDto & { suggestedByAi: boolean })[];   // bekræftede
  suggestedServices: ServiceDto[];                         // seneste AI-forslag, ikke bekræftet
  images: ImageDto[];
  hasConversation: boolean;
  aiSummary: AiSummary | null;
  summaryText: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  leadCount: number;
  canSend: boolean;                                        // lib/domain/leads.ts
};

export type CaseListItemDto = {
  id: string; status: CaseStatus; isEmergency: boolean; serviceNames: string[];
  submittedAt: string | null;
  leads: { id: string; clinicName: string; status: LeadStatus }[];
  nextBooking: { startsAt: string; clinicName: string } | null;
};
```

"(+anonym)" = virker også for en anonym patient, der ejer sagen.

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/cases` | kun patient med konto (anonyme: 403) | | `{ cases: CaseListItemDto[] }`. `nextBooking` er sagens næste fremtidige `booked` tid (fra 6.1); `clinicName` kommer fra `patient_lead_clinics()` |
| POST `/api/cases` | kun patient med konto (anonyme: 403) | `{}` | 201 `CaseDto` |
| GET `/api/cases/{id}` | patient (+anonym), ejer | | `CaseDto` |
| PATCH `/api/cases/{id}` | patient (+anonym), `draft` | `{ postalCode?, preferredTimeframe? }` | `CaseDto` |
| DELETE `/api/cases/{id}` | patient (+anonym), `draft` | | 204. Controlleren tjekker ejer og kladde med brugerens JWT og sletter derefter sagen og billedfilerne med service role (der er ingen DELETE-policy på `cases`, 5.4) |
| PUT `/api/cases/{id}/services` | patient (+anonym), `draft` | `{ services: { serviceId, suggestedByAi }[] }` (1-5) | `CaseDto` |
| POST `/api/cases/{id}/images` | patient (+anonym), `draft`, aktivt `image_upload` | multipart `file` | 201 `ImageDto`; 411 `LENGTH_REQUIRED` uden `content-length` |
| DELETE `/api/cases/{id}/images/{imageId}` | patient (+anonym), `draft` | | 204 |
| POST `/api/cases/{id}/summary` | patient (+anonym), `draft`, aktivt `ai_processing` | `{}` | `SummaryResponse`. Udkastet gemmes, også når billeder bør tages om; `retakeImages` fortæller patienten det, men blokerer ikke godkendelsen |
| PUT `/api/cases/{id}/summary` | patient (+anonym), `draft` | `{ summaryText }` (max 1500) | `{ summaryText, summaryApprovedAt }` |
| POST `/api/cases/{id}/leads` | patient med konto, aktivt `health_data_sharing` | `{ clinicIds: string[] }` (1-3; samlet ≤ 3 med de **aktive** leads og ≤ 10 med alle leads på sagen) | 201 `{ leads: PatientLeadDto[] }`; 403 `ACCOUNT_REQUIRED`; 409 `LEAD_LIMIT`, `LEAD_TOTAL_LIMIT`, `CLINIC_ALREADY_CONTACTED`, `CLINIC_NOT_AVAILABLE`, `CASE_NOT_READY`; 429 `LEAD_DAILY_LIMIT`, `RATE_LIMITED` |
| POST `/api/leads/{id}/withdraw` | patient, ejer af sagen, lead `sent` | `{}` | `PatientLeadDto` (status `withdrawn`); 409 `LEAD_NOT_PENDING`, hvis leadet er besvaret |
| GET `/api/cases/{id}/leads` | patient (+anonym), ejer | | `{ leads: PatientLeadDto[] }` |
| POST `/api/cases/{id}/close` | patient (+anonym for kladde), ejer; sag `draft` eller `submitted` | `{}` | `CaseDto` med `status: "closed"`. Kalder `close_case()`: ubesvarede og accepterede leads uden booking bliver `withdrawn`, reservationer frigives, bookede tider består. Idempotent |

```ts
export type SummaryResponse = {
  summary: AiSummary | null;
  retakeImages: { imageId: string; reason: "too_dark" | "blurry" | "wrong_angle" | "not_teeth" }[];
  outOfScopeNotice: boolean;
  fallback: "none" | "write_yourself";
  generationsLeft: number;
};
```

### 10.6 AI-chat (patient)

Bygget i trin 3 (3.3): `controllers/chatController.ts`, `models/chatRepository.ts`, `lib/schemas/chat.ts`, `services/ai/{aiChatService,aiSummaryService,modelClient,fakeAiClient}.ts` og `services/aiImageService.ts` (billeder til AI'en). Svaret på patientens 30. besked gemmes, selvom samtalen dermed er lukket (5.3). Turen reserveres før modelkaldet med `reserve_chat_turn()`; fejler noget efter reservationen, gemmes `CHAT_UNAVAILABLE_TEXT`, og routen svarer 503 `AI_UNAVAILABLE`, så frontend ved, at turen er gemt, og henter samtalen igen i stedet for at sende beskeden igen (chatpanelet gør det fra commit `4649015d`). IP-grænse 120 pr. time. En anonym session, der har været inaktiv i over 48 timer, afvises med 401 og forlænges ikke.

```ts
// lib/types/ai.ts (fortsat)
export type AiChatMessageDto = {
  id: string; role: "user" | "assistant"; content: string;
  preliminaryAssessment: string | null;
  suggestedServices: ServiceDto[];
  emergency: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  blocked: boolean; createdAt: string;
};
export type ChatStateDto = { conversationId: string | null; status: "active" | "closed"; messages: AiChatMessageDto[]; messagesLeft: number; readyForSummary: boolean };
export type ChatTurnResponse = { userMessage: AiChatMessageDto; assistantMessage: AiChatMessageDto; outOfScopeNotice: boolean; emergency: boolean; readyForSummary: boolean; messagesLeft: number };
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/cases/{id}/chat` | patient (+anonym), ejer | | `ChatStateDto` |
| POST `/api/cases/{id}/chat` | patient (+anonym), ejer, `draft`, aktivt `ai_processing` | `{ message }` (1-1000) | 201 `ChatTurnResponse`; 403 `CONSENT_REQUIRED`; 409; 429 `CHAT_LIMIT`/`RATE_LIMITED`/`ANON_CAP_REACHED`; 503 |

### 10.7 Klinikoversigt og profil (offentligt)

Bygget i trin 2 (2.3). `ClinicDirectoryController` (offentlig, `session: Session | null`) bruger `ClinicDirectoryRepository` (`public_*`-funktionerne), `AvailabilityRepository.listBusyIntervals()`, `RankingService` og `AvailabilityService`. Offentlige anmeldelser og statistik (`public_reviews()`, `public_clinic_review_stats_many()`) læses i `ReviewsRepository` (`listPublic()`, `reviewStats()`, flyttet fra `ClinicDirectoryRepository` i 6.2; DTO'erne er uændrede); `ClinicDirectoryController` får det som dependency `reviews`. Trustpilot-felterne mappes ét sted, `trustpilotFromColumns()` i `models/db/mappers.ts`. **Mellemformer (besluttet):** `PublicClinicRecord` og `PublicClinicProfileRecord` (rækkerne fra `public_*` før rangering og DTO-formning) er server-interne og ligger i `models/clinicDirectoryRepository.ts`, ikke i `lib/types/`. Tidsintervaller har én type, `BusyInterval` i `lib/types/clinics.ts`, som repository, service og controller bruger. `public_reviews()` returnerer `created_at` (migration `20261017000100`), og `createdMonth` i `PublicReviewDto` beregnes som `"YYYY-MM"` i dansk tid med `toClinicMonth()` i `lib/domain/time.ts`, som også har `DAY_MS`. `servicesParamSchema` (validering af `?services=`) eksporteres fra `lib/schemas/clinics.ts` og bruges af både API og views. Filterreglerne og fejlkoderne står i 6.6; beregningen af første ledige tid i 6.7.

```ts
// lib/types/clinics.ts
export type ClinicStatus = (typeof CLINIC_STATUSES)[number]; // "imported" | "registered" | "verified" | "removed" (2.1)
export type OpeningHoursDto = { weekday: number; opensAt: string; closesAt: string; isEmergency: boolean };
export type ClinicPriceDto = { serviceId: string; serviceSlug: string; serviceName: string; price: PriceRange; durationMin: number; note: string | null };

export type ClinicListItemDto = {
  id: string;
  name: string;
  tier: "basic" | "full";
  canReceiveLeads: boolean;            // status === "verified"
  address: string; postalCode: string; city: string;
  location: { lat: number; lng: number } | null;
  phone: string | null; website: string | null;
  openingHours: OpeningHoursDto[];
  distanceKm: number | null;
  trustpilot: TrustpilotInfo;          // alle niveauer, når kendt
  // kun tier "full", ellers null/[]
  reviewStats: ReviewStats | null;     // egne anmeldelser kun for verificerede
  logoUrl: string | null;
  prices: ClinicPriceDto[];            // for de valgte ydelser
  priceForSelection: PriceRange | null;// sum for de valgte ydelser; null hvis en mangler
  firstAvailableAt: string | null;     // for de valgte behandlinger, ellers Undersøgelse (6.7)
  firstEmergencyAt: string | null;     // kun klinikker med akutvindue (6.7)
};

export type ClinicProfileDto = ClinicListItemDto & {
  description: string | null;
  email: string | null;
  allPrices: ClinicPriceDto[];
  dentists: { id: string; fullName: string; title: string | null; bio: string | null; photoUrl: string | null;
              portfolio: { id: string; imageUrl: string; caption: string | null; serviceName: string | null }[] }[];
};

export type SlotDto = { startsAt: string; endsAt: string };
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/clinics` | alle | `?ids=uuid,uuid` (valgfri, højst 3; kun disse klinikker, via `public_clinics(p_clinic_ids)`; bruges af afsendelsessiden) `&services=slug,slug&postalCode=&lat=&lng=&maxDistanceKm=&maxPrice=&minStars=&emergency=true&contactableOnly=true&sort=price\|rating\|price_accuracy\|distance\|first_available` | `{ clinics: ClinicListItemDto[], sort, criteria: string[] }`. Sorteret af `RankingService` (6.6). `lat/lng` gemmes ikke. 400 `UNKNOWN_SERVICE` (ukendt slug eller over 5), 400 `UNKNOWN_POSTAL_CODE`, 400 ved `lat` uden `lng` eller `maxPrice` uden valgte behandlinger. Ukendte parametre ignoreres |
| GET `/api/clinics/{id}` | alle | `?services=` (samme regler) | `ClinicProfileDto`. `distanceKm` er altid `null` på profilen; 404 for klinikker, der ikke er offentlige (5.1 regel 11) |
| GET `/api/clinics/{id}/availability` | alle | `?serviceId=&from=&to=` (max 14 dage pr. kald) | `{ slots: SlotDto[] }`. Kun verificerede; 404 ellers (6.7) |
| GET `/api/clinics/{id}/reviews` | alle | | `{ stats: ReviewStats, reviews: PublicReviewDto[] }`. 404 for ikke-verificerede klinikker |

### 10.8 Egen klinik (rolle `clinic`)

Bygget i trin 1 og 1.9 (undtagen anmeldelser). Billedupload (logo, portræt, portefølje) læses med `readImageForm` (2.1) og er IP-rate-limited med `enforceIpRateLimit("clinic-image-upload", req)`: 10 pr. time pr. IP, samme grænse som patienters billedupload (429 `RATE_LIMITED`). En tom PATCH (`{}`) på profil, tandlæge eller porteføljeelement returnerer den uændrede ressource (200) i alle routes. Lofterne står i 7.6. Delt logik mellem `ClinicsController` (profilens forhåndsvisning) og `ClinicDentistsController` ligger i `lib/domain/dentists.ts` (`attachPortfolio()`), så controllerne ikke kalder hinanden.

| Metode og route | Input | Output |
|---|---|---|
| DELETE `/api/clinics/me` | `{ confirm: "SLET" }` | 204. Rækkefølge: (0) controlleren henter klinikkens id med **brugerens** klient (`ClinicsRepository.requireOwnId()`), aldrig med service role (2.3), (1) sletter klinikkens filer i `public-media` (logo, tandlægeportrætter, portefølje) med service role, (2) sletter auth-brugeren via `AccountDeletionService` (service role), (3) triggeren `clinics_after_owner_removed()` (5.3) afviser åbne leads med `clinic_left` og aflyser fremtidige bookinger, og derefter: en **importeret** klinik bliver `imported` med bevarede grunddata (navn, adresse, postnummer, by, telefon, åbningstider og Trustpilot indtastet af admin), mens prisliste, valgte kategorier, blokerede tider, tandlæger, portefølje, beskrivelse, logo, e-mail, website og klinikindtastet Trustpilot slettes; en klinik, **der oprettede sig selv** (`import_source is null`), bliver `removed`: skjult overalt, CVR nulstillet, samme oprydning plus åbningstider og telefon; kun navn og adresse bevares, så patienternes historik består (5.3). Logger ud |
| GET/PATCH `/api/clinics/me` | PATCH `{ name?, description?, address?, postalCode?, city?, phone?, email?, website?, trustpilotUrl?, trustpilotScore?, trustpilotReviewCount? }` | `ClinicProfileDto & { status: ClinicStatus; cvr: string }` (forhåndsvisning af fuld profil uanset status). `reviewStats` er bevidst `null` i forhåndsvisningen; klinikkens egne anmeldelser hentes fra `GET /api/clinics/me/reviews` (10.13) |
| POST/DELETE `/api/clinics/me/logo` | multipart `file` | `{ logoUrl }` / 204 |
| GET/PUT `/api/clinics/me/service-groups` | PUT `{ groupIds: string[] }` (erstatter valget; kun aktive kategorier) | `{ groupIds: string[] }`. PUT kalder `set_clinic_service_groups()`; priser i fravalgte kategorier slettes (UI advarer først) |
| GET/PUT `/api/clinics/me/prices` | PUT `{ prices: { serviceId, priceMin, priceMax, durationMin, note? }[] }` (erstatter hele listen; højst 100 rækker; priser 0-1.000.000 kr.; kun behandlinger i valgte kategorier) | `{ prices: ClinicPriceDto[] }`; 400 ved overskridelse; 409 `SERVICE_GROUP_NOT_SELECTED`. Udskiftningen sker i én transaktion via `replace_clinic_prices()`; en tom liste sletter alle priser |
| GET/PUT `/api/clinics/me/opening-hours` | PUT `{ hours: { weekday, opensAt: "HH:MM", closesAt: "HH:MM", isEmergency }[] }` (højst 42 vinduer) | `{ hours: OpeningHoursDto[] }`; 400 ved overskridelse. I én transaktion via `replace_opening_hours()`; en tom liste sletter alle vinduer |
| GET/POST `/api/clinics/me/time-blocks` | POST `{ startsAt, endsAt, note? }`; GET `?from=&to=` | `{ blocks: { id, startsAt, endsAt, note }[] }` / 201; 429 `TIME_BLOCK_LIMIT` ved over 200 blokeringer |
| DELETE `/api/clinics/me/time-blocks/{id}` | | 204 |
| GET/POST `/api/clinics/me/dentists` | POST `{ fullName, title?, bio?, sortOrder? }` | `{ dentists: … }` / 201; 429 `DENTIST_LIMIT` ved over 30 tandlæger |
| PATCH/DELETE `/api/clinics/me/dentists/{id}` | PATCH samme felter valgfri | dentist / 204 (sletter også portræt og portefølje) |
| POST/DELETE `/api/clinics/me/dentists/{id}/photo` | multipart `file` | `{ photoUrl }` (med `?v=`, 9.5) / 204 |
| POST `/api/clinics/me/portfolio` | multipart: `file`, `dentistId`, `serviceId?`, `caption?`, `patientConsentConfirmed: "true"`, `consentTextVersion` (læses med `readImageForm`; tekstfelterne valideres, før billedet behandles) | 201 portfolio item; 400 uden bekræftelse eller ved forkert `consentTextVersion`; 429 `PORTFOLIO_LIMIT` ved over 60 billeder pr. klinik |
| PATCH/DELETE `/api/clinics/me/portfolio/{id}` | PATCH `{ caption?, serviceId? }` | item / 204 |
| GET `/api/clinics/me/reviews` | | `{ reviews: ClinicReviewDto[] }` (10.13): godkendte anmeldelser af egen klinik med eget svar og dets status, via `clinic_reviews()`. 403 `CLINIC_NOT_VERIFIED` for ikke-verificerede. Bygget i 6.2 |

### 10.9 Leads

```ts
// lib/types/leads.ts
export type LeadStatus = "sent" | "accepted" | "declined" | "booked" | "withdrawn";
export type LeadDeclineReason = "no_capacity" | "not_offered" | "needs_referral" | "other" | "clinic_left"; // clinic_left: "Klinikken er ikke længere på TandMatch"

export type PatientLeadDto = {
  id: string;
  clinic: { id: string; name: string; city: string; logoUrl: string | null;
            removed: boolean };      // true → UI viser "Klinikken er ikke længere på TandMatch"; logoUrl er null
  // Patienter har ingen SELECT på clinics; klinikkens navn m.m. på egne leads læses via en security definer-funktion
  // (patient_lead_clinics(p_case_id default null), migration 20261021000100), der også returnerer 'removed' klinikker
  // (uden logo), men kun for patientens egne leads. `booking` udfyldes af `LeadsController` fra `BookingsRepository.currentByLead()` (6.1).
  status: LeadStatus;
  sentAt: string; respondedAt: string | null;
  listPrice: PriceRange | null;
  quotedPrice: PriceRange | null;
  clinicComment: string | null;
  declineReason: LeadDeclineReason | null;
  declineNote: string | null;          // klinikkens note ved afvisning (højst 200 tegn); klinikken får at vide, at patienten ser den
  booking: PatientBookingDto | null;   // aktiv eller seneste
  unreadMessages: number;
};

export type ClinicLeadListItemDto = {
  id: string; status: LeadStatus; isEmergency: boolean;
  serviceNames: string[];
  area: { postalCode: string | null; city: string | null };
  distanceKm: number | null;
  preferredTimeframe: CaseTimeframe | null;
  requestedStartsAt: string | null;
  imageCount: number;
  sentAt: string; seenAt: string | null; withdrawnAt: string | null;
  unreadMessages: number;
};

export type ClinicLeadDetailDto = ClinicLeadListItemDto & {
  services: Pick<ServiceDto, "id" | "slug" | "name" | "description" | "category">[];  // det clinic_lead_detail() returnerer
  summaryText: string; summaryAiAssisted: boolean;
  // view og quality er null (AI'ens billedvurdering deles ikke med klinikken); description = approvedDescription, som kan være null
  images: (ImageDto & { approvedDescription: string | null })[];
  listPrice: PriceRange | null;
  decision: { comment: string | null; quotedPrice: PriceRange | null; declineReason: LeadDeclineReason | null; declineNote: string | null; respondedAt: string } | null;
  booking: ClinicBookingDto | null;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads` | klinik (verificeret) | `?status=` (valgfri `LeadStatus`) | `{ leads: ClinicLeadListItemDto[] }` (`clinic_leads(p_status)`) |
| GET `/api/leads/{id}` | klinik (ejer) | | `ClinicLeadDetailDto`. Sætter `seen_at` via `clinic_mark_lead_seen()` (pragmatisk sideeffekt) |
| POST `/api/leads/{id}/decision` | klinik (ejer, verificeret) | `{ decision: "accept", comment?, quotedPriceMin?, quotedPriceMax? }` eller `{ decision: "decline", reason (alle undtagen "clinic_left"), note? }` | `ClinicLeadDetailDto`; 409 hvis ikke `sent` (fx trukket tilbage). Accept af akut-lead inden for reservationen gør tiden til en booking; efter udløb bliver leadet `accepted` uden booking, og patienten booker selv |

`unreadMessages` på `GET /api/leads/{id}` kommer fra `clinic_lead_detail()` (ét kald pr. RPC, 2.1). For et lead med status `withdrawn` returnerer `GET /api/leads` og `GET /api/leads/{id}` kun `id`, `status`, `sentAt` og `withdrawnAt`; øvrige felter er tomme værdier (`false`, `[]`, `null`, `0`, `""`) (5.7).

Bygget i 5.1: `LeadsController` (`listForClinic`, `getForClinic`, `decide`) og `LeadsRepository`. En ikke-verificeret klinik får 403 `CLINIC_NOT_VERIFIED` på alle tre routes; ukendt eller fremmed lead giver 404, beslutning på et lead, der ikke er `sent`, 409 `LEAD_NOT_PENDING`. `GET /api/leads/{id}` sætter `seen_at` før detaljen læses. `ClinicBookingDto` og `BookingStatus` ligger i `lib/types/bookings.ts`, som blev udvidet i 6.1 (10.10).

Patienten læser sine leads via `GET /api/cases/{id}/leads` (10.5).

### 10.10 Bookinger

```ts
// lib/types/bookings.ts
export type BookingStatus = "held" | "booked" | "completed" | "no_show" | "cancelled"; // altid effektiv status (4.2)
export type PatientBookingDto = {
  id: string; leadId: string; clinic: { id: string; name: string; address: string; city: string };
  service: { id: string; name: string }; startsAt: string; endsAt: string; status: BookingStatus;
  canCancel: boolean; canReview: boolean;   // canCancel: booked og før starttid. canReview: effektivt completed (ends_at + 24 t) og endnu ikke anmeldt
  holdExpiresAt: string | null;             // kun held (akut)
};
export type ClinicBookingDto = {
  id: string; leadId: string; service: { id: string; name: string };
  startsAt: string; endsAt: string; status: BookingStatus;
  contact: { name: string; phone: string; email: string } | null;   // kun booked/completed (5.5), aldrig held
  canMarkNoShow: boolean;              // starts_at <= nu < ends_at + 24 t
  canCancel: boolean;                  // booked og før starttid (klinikken kan aflyse, 6.1)
  holdExpiresAt: string | null;        // kun held
};
// Dataeksporten (10.2): patientens egne bookinger
export type BookingExportDto = {
  id: string; leadId: string; clinicId: string; clinicName: string; serviceName: string;
  startsAt: string; endsAt: string; status: BookingStatus;
  contactName: string; contactPhone: string; contactEmail: string;
  cancelledBy: "patient" | "clinic" | null; cancelledAt: string | null; noShowAt: string | null; completedAt: string | null;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads/{id}/availability` | patient med konto (ejer af sagen), lead `accepted` | `?serviceId=&from=&to=` | `{ slots: SlotDto[] }` (som 10.7, men kun for leadets klinik og sagens ydelser). 409 `LEAD_NOT_ACCEPTED` (også når leadet allerede har en tid, status `booked`), 409 `CLINIC_NOT_AVAILABLE`, 400 for en ydelse uden for sagen, 404 for fremmed lead |
| POST `/api/leads/{id}/booking` | patient (ejer), lead `accepted` | `{ serviceId, startsAt, contactName, contactPhone }` | 201 `PatientBookingDto`; 409 `SLOT_TAKEN`, `LEAD_NOT_ACCEPTED`, `SLOT_UNAVAILABLE`, `CLINIC_NOT_AVAILABLE`, `BOOKING_LIMIT` (højst 5 bookinger i alt pr. lead); 429 `RATE_LIMITED` (30 pr. IP pr. time); 400 for en ydelse uden for sagen eller ugyldig kontakt (telefon: mindst 8 cifre); 403 `ACCOUNT_REQUIRED` for anonyme; 404 for fremmed lead |
| GET `/api/bookings` | patient med konto: egne (nyeste starttid først); verificeret klinik: egne (`?from=&to=`; uden grænser 7 dage tilbage og 60 dage frem, højst 92 dage pr. kald, ellers 400) | | `{ bookings: PatientBookingDto[] }` eller `{ bookings: ClinicBookingDto[] }` |
| POST `/api/bookings/{id}/cancel` | patient eller verificeret klinik (ejer), før starttid | `{}` | `PatientBookingDto` / `ClinicBookingDto` (efter rollen); 409 `BOOKING_NOT_CANCELLABLE` (efter starttid eller ikke længere `booked`); 404 for fremmed booking |
| POST `/api/bookings/{id}/no-show` | klinik (ejer), fra starttid til 24 timer efter sluttid | `{}` | `ClinicBookingDto`; 409 `NO_SHOW_WINDOW_CLOSED` |
| GET og POST `/api/cron/complete-bookings` | intern (`CRON_SECRET`), hver time | | 200 `{ completed: number, releasedHolds: number }`. Kalder `complete_due_bookings()` med service role. Undtaget fra vilkårs-gaten |

Der findes ingen route til at markere et besøg gennemført; det sker automatisk 24 timer efter sluttid (4.2, 8.1).

Bygget i 6.1. Filer: `controllers/bookingsController.ts` (`BookingsController`: `availabilityForLead`, `book`, `list`, `cancel`, `markNoShow`; rollen afgør patient- eller klinikvej), `models/bookingsRepository.ts` (`book_slot`, `cancel_booking`, `mark_booking_no_show`, `patient_bookings`, `clinic_bookings`, `clinic_booking`, `complete_due_bookings`; mapper til DTO'erne og normaliserer tidspunkter til ISO med `Z`), `lib/schemas/{bookings,phone}.ts`, `lib/domain/bookings.ts` (`canCancel`, `canMarkNoShow`, `canReview`, `graceEndsAt`, `pickLeadBooking`) og `lib/constants/bookings.ts`. `CronController.completeBookings()` bruger `BookingsRepository` med service role-klienten. Ledige tider for et lead genbruger `AvailabilityService` (nye `resolveRange()` og `durationFor()`, som `ClinicDirectoryController` også bruger) og `ClinicDirectoryRepository.findClinic()`; der er ingen kopi af beregningen. Kontaktfelter til klinikken kommer kun fra `clinic_bookings()`, `clinic_booking()` og `clinic_lead_detail()` (5.5). `canCancel`, `canReview` og `canMarkNoShow` beregnes i TypeScript ud fra den effektive status fra databasen; databasen er vogteren (`cancel_booking()`, `mark_booking_no_show()`). `canReview` er kun sand ved effektivt `completed` (`ends_at + 24 t`) og hvis der ikke allerede er en anmeldelse (`patient_bookings().reviewed`). Fejlkoder ud over de generelle: `BOOKING_NOT_CANCELLABLE`, `CLINIC_NOT_AVAILABLE`, `BOOKING_LIMIT` (409), og `CLINIC_NOT_VERIFIED` (403) for en ikke-verificeret klinik. `PatientLeadDto.booking` er den aktive (`held`/`booked`) booking, ellers den nyeste (`pickLeadBooking()`); `CaseListItemDto.nextBooking` er sagens næste fremtidige `booked` tid. **Rettelser i 6.7a.** `book_slot()` har loftet `BOOKING_LIMIT` (`MAX_BOOKINGS_PER_LEAD = 5` i `lib/constants/bookings.ts`, migration `20261027000100`); routen kalder `enforceIpRateLimit("booking", req, BOOKING_IP_LIMIT_PER_HOUR)` (30). Fejlene bygges af fabrikker i `middleware/http.ts` (`conflict`, `leadNotAccepted`, `clinicNotAvailable`, `serviceNotOnCase`, `slotTaken`, `slotUnavailable`, `bookingLimit`, `bookingNotCancellable`, `noShowWindowClosed`, `reviewNotAllowed`, `alreadyReviewed`, `alreadyReplied`); tekster, som også views viser, står i `lib/constants/error-texts.ts`. `toClinicBookingDto()` og `ClinicBookingFields` ligger i `models/db/mappers.ts` og giver kun `contact` ved `booked`/`completed` (security L1), så `LeadsRepository` ikke importerer `BookingsRepository`. `ClinicsRepository.requireOwnVerified()` erstatter de tre kopier af tjekket. `AvailabilityService.resolveRange(from, to, { defaultFrom, defaultDays, maxDays })` bruges også til klinikkens kalender. `phoneSchema` kræver mindst 8 cifre (`MIN_PHONE_DIGITS`, security L2). `MODERATION_LABEL` ligger i `lib/constants/reviews.ts`. Tests: `tests/api/bookings.test.ts`, `tests/unit/bookings.test.ts`, `tests/unit/mappersAndPhone.test.ts`, `tests/rls/47_booking_reads.sql`, `tests/rls/48_booking_limit.sql`.

### 10.11 Akutvej

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| POST `/api/emergency-leads` | patient med konto (anonyme: 403 `ACCOUNT_REQUIRED`), aktivt `health_data_sharing` | `{ clinicId, serviceId (akut), startsAt, description (10-1000), contactName, contactPhone, postalCode? }` | 201 `{ caseId, lead: PatientLeadDto }` med `booking.status = "held"`. Opretter sag (`is_emergency`, `summary_text = description` godkendt af patienten, ydelsen bekræftet) og kalder `send_leads(…, requested_*, contact_*)`, som reserverer tiden. 409 `SLOT_TAKEN`, `SLOT_UNAVAILABLE` |

### 10.12 Beskeder


| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads/{id}/messages` | deltager | | `{ messages: MessageDto[] }` (markerer modtagne som læst). Patient: direkte læsning og `read_at`-opdatering med RLS. Klinik: `clinic_lead_messages()` og `clinic_mark_messages_read()` |
| POST `/api/leads/{id}/messages` | deltager, lead `sent`/`accepted`/`booked` | `{ body }` (1-2000) | 201 `MessageDto`; 409 `THREAD_CLOSED` ved `declined`/`withdrawn` |

`MessageDto = { id, fromMe, senderRole, body, createdAt, readAt }` (`senderRole` viser "Klinikken", også når afsenderen er slettet). GET læser først og markerer derefter modtagne som læst, så svaret viser, hvad der var nyt; klinikken får en tom liste ved `withdrawn`. POST: 429 `MESSAGE_LIMIT` ved døgnloftet (200). Anonyme og admin får 403. Bygget i 5.2 (`MessagesController`, `MessagesRepository`, `lib/{types,schemas,constants}/messages.ts`). Polling hvert 15. sekund på åben tråd. Klinikkens statusopslag (åben eller lukket tråd) går via `clinic_lead_status()`, ikke direkte på `leads` (5.5; migration `20261024000100`). Afvises en indsættelse af RLS, kaster `MessagesRepository` en navngiven fejl, og `MessagesController` slår status op igen via `LeadsRepository` (repositories ejer ikke hinanden, 2.1.1): lukket tråd giver 409 `THREAD_CLOSED`, ellers 429 `MESSAGE_LIMIT`. Indsættelsen returnerer kun kolonnerne i `MessageDto` (ingen `sender_id`). Patienten får rækken direkte fra insert; klinikken har ingen SELECT på `messages`, så den indsatte besked hentes via `clinic_lead_messages()` (hele tråden; acceptabelt i prototypen). Beskedroutene kræver `requireRole(["patient", "clinic"])`.

### 10.13 Anmeldelser

Bygget i 6.2. `PublicReviewDto` er uændret; de øvrige typer ligger i `lib/types/reviews.ts`.

```ts
export type PublicReviewDto = {
  id: string; stars: number; text: string; priceAccuracy: PriceAccuracy;
  actualPrice: number | null; lackedTransparency: boolean | null; transparencyComment: string | null;
  verifiedVisit: true;
  createdMonth: string;   // "YYYY-MM" i dansk tid; beregnes af toClinicMonth(created_at) (lib/domain/time.ts)
  reply: { text: string; createdAt: string } | null;
};
export type ReviewEligibleItemDto = {
  bookingId: string; clinicId: string; clinicName: string; serviceName: string;
  visitedOn: string;                 // "YYYY-MM-DD" i dansk tid (toClinicDate), bookingens starttid
  priceEstimate: PriceRange | null;  // præciseret pris, ellers listepris (8.2); null hvis leadet ingen pris har
};
export type OwnReviewDto = PublicReviewDto & {
  bookingId: string; clinic: { id: string; name: string };
  moderationStatus: ModerationStatus; rejectionReason: string | null;
  // reply er kun med, når svaret er godkendt
};
export type ClinicReviewDto = PublicReviewDto & { replyStatus: ModerationStatus | null }; // reply: eget svar uanset status
export type ReviewCreatedDto = { id: string; moderationStatus: ModerationStatus };        // altid "pending"
export type ReviewExportDto = {
  id: string; bookingId: string; clinicId: string; stars: number; text: string; priceAccuracy: PriceAccuracy;
  actualPrice: number | null; lackedTransparency: boolean | null; transparencyComment: string | null;
  moderationStatus: ModerationStatus; rejectionReason: string | null; createdAt: string;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/reviews/eligible` | patient med konto | | `{ items: ReviewEligibleItemDto[] }`: bookinger med `canReview` (effektivt gennemført, ikke anmeldt), nyeste besøg først |
| GET `/api/reviews/mine` | patient med konto | | `{ reviews: OwnReviewDto[] }`, nyeste først, alle statusser |
| POST `/api/reviews` | patient med konto | `{ bookingId, stars (1-5), text (20-2000), priceAccuracy, actualPrice? (0-1.000.000 hele kr.), lackedTransparency?, transparencyComment? (max 500) }` (`.strict()`) | 201 `ReviewCreatedDto`; 403 `REVIEW_NOT_ALLOWED` (ikke egen booking, ikke gennemført, `no_show`, aflyst, før `ends_at` + 24 t eller klinikken ikke verificeret); 409 `ALREADY_REVIEWED`; 404 for en ukendt booking; 400 ved ugyldigt input |
| POST `/api/reviews/{id}/reply` | verificeret klinik (anmeldt) | `{ text }` (1-1000, `.strict()`) | 201 `ReviewCreatedDto`; 404 for en anmeldelse klinikken ikke kan se (fremmed, ukendt eller endnu ikke godkendt); 409 `ALREADY_REPLIED`; 403 `CLINIC_NOT_VERIFIED` |
| GET `/api/clinics/me/reviews` | verificeret klinik | | `{ reviews: ClinicReviewDto[] }` (10.8) |

`clinicId` udledes på serveren fra `bookingId` (triggeren `reviews_before_insert`) og kan ikke angives. Anonyme får 403 `ANONYMOUS_NOT_ALLOWED` fra `requireRole`. Nye anmeldelser og svar er `pending`, til de godkendes manuelt i databasen (8.5); først da vises de i `GET /api/clinics/{id}/reviews` (10.7), i prisnøjagtigheden og i klinikkens `clinic_reviews()`.

Filer: `controllers/reviewsController.ts` (`ReviewsController`: `eligible`, `create`, `mine`, `listForClinic`, `reply`), `models/reviewsRepository.ts` (`ReviewsRepository`: offentlig læsning og statistik, `create`, `listOwn`, `listOwnForExport`, `listForClinic`, `createReply`), `lib/schemas/reviews.ts`, `lib/domain/reviews.ts` (`priceEstimate`), `lib/constants/reviews.ts` (længder), `toClinicDate()` i `lib/domain/time.ts` og `LeadsRepository.priceEstimates()`. Reglerne håndhæves af RLS-policyerne (8.1) og unique-nøglerne; controlleren genimplementerer dem ikke. `eligible` og `mine` bruger `BookingsRepository.listForPatient()` (klinikkens navn, `canReview`) i stedet for en ny funktion. Svaret på `mine` læser godkendte svar fra `public_reviews()`, fordi patienten ikke kan læse `review_replies`. Svar-routen tjekker først mod `clinic_reviews()` (404/409) og lader derefter policyen være vogter. Kendt begrænsning: `eligible` kan vise et besøg hos en klinik, der siden er blevet ikke-verificeret; `POST` giver da 403. Tests: `tests/api/reviews.test.ts`, `tests/unit/reviews.test.ts`.

### 10.14 Admin

Hele admin-API'et er [IKKE BYGGET] og ikke planlagt i demoen: moderation (`/api/admin/moderation`) og klinikstatus (`/api/admin/clinics/{id}/status`) [UDSKUDT].

---

## 11. Byggetrin og status

Start på omlægningen 2026-10-12. Hvert trin afsluttes med reviewer og tester; security køres ved ændringer i login, databaseregler og billeder, før merge til main og før demo. Opgaverne pr. trin står i `docs/arbejdsplan.md`.

| Trin | Indhold | Status |
|---|---|---|
| 0 Database og oprydning | Nyt samlet migrationssæt (nedenfor), `supabase/config.toml`, `seed.sql`, nyt seed-script, RLS- og API-tests, fjernelse af den gamle domænekode, kernen som klasser (12.5) | Bygget (0.1-0.11 committet på `feat/omlaegning-trin-0`). 0.8 (nulstilling af det fælles projekt) udføres manuelt af brugeren |
| 1 | Ydelseskatalog, klinikprofil med prisliste, åbningstider og tandlæger (inkl. klinik-signup, rollen `clinic`, `/klinik`) | Bygget og afsluttet på `feat/omlaegning-trin-1` (sidste commit `623314f4`). Ingen åbne kritiske fund. Tests: RLS 36, API 82, unit 6, e2e 6; klinikrejsen 40 af 40 gentagelser uden logud-fejl. Mangler: HSTS tjekket i en produktionsbuild, og migration `20261016000200` køres i det fælles projekt |
| 2 | Forside, klinikoversigt med kort, filtre og klinikprofil | Bygget og afsluttet på `feat/omlaegning-trin-2` (sidste commit `98c6a022`; 2.1-2.6 i `4ec5b70e`, `6286c8ed`, `a3f8d47b`, `ea70980b`; 2.8 rettelser efter review). Tests: RLS 36, API 112, unit 54, e2e 16 (begge viewports), gentagelser 40/40 uden ustabilitet, ingen CSP-fejl. `tests/e2e/run.sh` kører `npm run seed:demo` før Playwright (spring over med `E2E_SKIP_SEED=1`). Mangler: migrationerne `20261016000200` og `20261017000100` køres i det fælles projekt. Forsidens `ClinicPreview` er stadig illustrationer, ikke rigtige klinikker |
| 3 | AI-chat med billeder, forslag til ydelser og opsummering | I gang på `feat/omlaegning-trin-3`: 3.1-3.4 bygget (`dbdd3881` AI-regler, `ba7115b2` sager og billeder, `adf9c53c` chat og opsummering, sagsflowets sider); 3.5 review og security gennemført; 3.6 bygget (`b2f2aff8`, `df541715`, `88995a2b`, `4649015d`) og fulgt op af reviewer og security; 3.7a-c bygget (`7c0b24f4` AI-filtre, 3.7b backend; 3.7c var allerede dækket af `4649015d`); 3.7d (tester) er i gang |
| 4 | Sammenligning og leads til op til 3 klinikker | Bygget og afsluttet på `feat/omlaegning-trin-4` (sidste commit `7c6c0d0e`). Tests: RLS 41, API 188, unit 384, e2e 28 |
| 5 | Klinikkens indbakke: accepter eller afvis | Bygget og afsluttet på `feat/omlaegning-trin-5` (sidste commit `95427c61`). Tests: RLS 44, API 207, unit 397, e2e 62 |
| 6 | Booking i klinikkens kalender og anmeldelser efter besøget | Færdigt på `feat/omlaegning-trin-6` (6.1-6.5, kontrol 6.6, rettelser 6.7a-d; sidste commit `af065eb5`). Tests: RLS 46, API 249, unit 436, e2e 108 |
| 7 | Akutvej, demodata og finpudsning | [IKKE BYGGET] |
| Infrastruktur | Vilkårs-gate, MVC-lag med ESLint og klasser (2.1.1), auth, anonym session, samtykker, billedbehandling, UI-komponenter | Bygget |

**Migrationer:** det gamle sæt (27 filer) er slettet fra koden og erstattet af det samlede sæt nedenfor (bygget i trin 0). Det fælles Supabase-projekt er nulstillet og kører det nye sæt (0.8, udført 2026-10-12; tjek i 2.3.1). Der er nu 34 migrationer: de 12 i det samlede sæt, `20261013000100`, fem `20261014`-filer, to `20261015`-filer, to `20261016`-filer (securitys rettelser), `20261017000100` (trin 2), `20261018000100`, to `20261019`-filer og `20261020000100` (trin 3) og `20261021000100`, `20261022000100` (trin 4) og `20261023000100`, `20261024000100` og `20261025000100` (trin 5) `20261026000100` og `20261027000100` (trin 6). De første 33 er kørt i det fælles projekt (senest `20261026000100` den 2026-10-18; brugeren kører dem). **`20261027000100` er ikke kørt i det fælles projekt endnu.** Nye ændringer kommer som nye filer (2.6). Sættet:

| Fil | Indhold |
|---|---|
| `20261012000000_extensions_enums.sql` | `btree_gist`, alle enums (4.2) |
| `20261012000100_profiles_terms_consents.sql` | `profiles`, `patients`, `terms_acceptances`, `consent_text_versions`, `consents`, `postal_codes`, hjælpefunktioner uden domæneafhængighed |
| `20261012000200_services_catalog.sql` | `services` + startkatalog |
| `20261012000300_clinics.sql` | `clinics`, `clinic_prices`, `clinic_opening_hours`, `clinic_time_blocks`, `clinic_dentists`, `portfolio_items`, `clinics_guard()`, `admin_set_clinic_status()` |
| `20261012000400_auth_triggers.sql` | `handle_new_user()` (patient, klinik, anonym, CVR-tilknytning, metadata som i 4.3), `is_cvr_claimed()`, `is_anonymous`-spejl |
| `20261012000500_cases_ai.sql` | `cases`, `case_services`, `ai_conversations`, `ai_messages`, AI-lofter og -funktioner (inkl. `try_consume_anonymous_ai_call(p_user_id)`) |
| `20261012000600_case_images_storage.sql` | `case_images`, buckets `case-images` og `public-media`, storage-regler |
| `20261012000700_leads_messages.sql` | `leads`, `messages`, `clinic_mark_lead_seen()`. `send_leads()`, `clinic_decide_lead()` og `withdraw_lead()` ligger i bookingfilen, fordi de opretter og ændrer `held`-bookinger |
| `20261012000800_bookings.sql` | `bookings`, udelukkelse (inkl. `held`), check for helt kvarter, `effective_booking_status()`, `assert_slot_bookable()`, `service_duration_min()`, `release_expired_holds()`, `send_leads()`, `clinic_decide_lead()`, `withdraw_lead()`, `close_case()`, `clinics_after_owner_removed()`, `book_slot()`, `cancel_booking()`, `mark_booking_no_show()`, `complete_due_bookings()` |
| `20261012000900_reviews.sql` | `reviews`, `review_replies`, statistik |
| `20261012001000_read_functions.sql` | `clinic_*` (inkl. `clinic_lead_messages()`, `clinic_mark_messages_read()`) og `public_*` (5.3, 5.7) |
| `20261012001100_consent_withdrawal_cleanup.sql` | `withdraw_consent()`, `confirm_consent_cleanup()`, `touch_last_active()`, `consume_rate_limit()` |
| `20261013000100_dentist_photo_version.sql` | `clinic_dentists.photo_updated_at` (versioneret portræt-URL, 9.5) |
| `20261014000100_service_groups.sql` | `service_groups` + startkategorier, `services.group_id` (eksisterende behandlinger placeres, nye indsættes efter `docs/behandlingskatalog.md`), type-check for `akut` |
| `20261014000200_clinic_service_groups.sql` | `clinic_service_groups`, trigger på `clinic_prices` (valgt kategori), `set_clinic_service_groups()`, `replace_clinic_prices()`, `replace_opening_hours()`, `clinics.logo_updated_at` |
| `20261014000300_public_visibility.sql` | `create or replace` af `public_*`: kun `verified` og `imported` uden ejer; kategori pr. behandling |
| `20261014000400_clinic_owner_removed.sql` | ny version af `clinics_after_owner_removed()` med rækkeoprydningen (inkl. e-mail, website og valgte kategorier); selvoprettede klinikker behandles midlertidigt som importerede |
| `20261014000500_clinic_hardening.sql` | kolonne-grants på `clinic_dentists`, check på `clinics.website`, lofter i databasen (tandlæger, portefølje, åbningsvinduer, blokeringer) |
| `20261015000100_clinic_status_removed.sql` | `alter type public.clinic_status add value 'removed'`. Egen fil, fordi en ny enum-værdi ikke må bruges i samme transaktion, som den tilføjes i |
| `20261015000200_clinic_removed.sql` | check `clinics_status_owner_check` (4.3); `clinics_guard()` sætter `removed`/`imported` og rydder klinikrækkens felter, når ejeren fjernes, og afviser ændringer af en `removed` klinik; `clinics_after_owner_removed()` rydder rækker i andre tabeller (gren (b) også åbningstider); `handle_new_user()`/`is_cvr_claimed()` (CVR-tilknytning kun til `imported` uden ejer); `public_clinics()` udelukker `removed` eksplicit; ny trigger `leads_clinic_guard()` afviser leads til en `removed` klinik (5.3) |
| `20261016000100_clinic_import_snapshot.sql` | `clinic_import_snapshots` (RLS uden policies); `handle_new_user()` gemmer snapshot ved CVR-overtagelse; `clinics_guard()` og `clinics_after_owner_removed()` gendanner grunddata og åbningstider for en ikke-verificeret ejer og sletter snapshottet (4.3) |
| `20261016000200_services_active_groups.sql` | Policyen på `services` skjuler også behandlinger i en inaktiv kategori (5.4, RLS-test 38). |
| `20261017000100_public_reviews_created_at.sql` | `public_reviews()` returnerer `created_at` i stedet for `created_month`; måneden beregnes i TypeScript (10.13). |
| `20261018000100_ai_reply_after_message_cap.sql` | `append_assistant_message()` accepterer et svar i en lukket samtale, hvis den seneste besked er patientens (svaret på den 30. besked, 5.3). |
| `20261019000100_reserve_chat_turn.sql` | første version af `reserve_chat_turn` (kaldt med patientens JWT; signaturen og rettighederne er ændret i `20261020000100`), tabel `ai_anon_user_usage_daily`, `ai_limits.anon_user_daily_ai_calls` (40) og `chat_messages_per_patient_day`, intern `consume_anonymous_ai_call()`; strammere `append_assistant_message()` (aktivt `ai_processing`, kladde, lukket samtale kun ved loftet på 30). |
| `20261019000200_image_description_sharing.sql` | `case_images.ai_described_at` (trigger); `clinic_lead_images()` returnerer `ai_description` kun efter patientens godkendelse (fail closed); `approve_summary(uuid, text, boolean default null)` sætter `summary_ai_assisted` (false uden AI-udkast). |
| `20261020000100_ai_calls_service_role_only.sql` | `reserve_chat_turn(p_user_id, p_conversation_id, p_content)` og `consume_summary_generation(p_user_id, p_case_id)` kun for service role (tjekker selv ejer, kladde og samtykke; opsummering forbruger anonymes eget døgnloft); `ai_patient_usage_daily.chat_messages` (UTC-dag) erstatter det rullende døgn; `patient_user_messages_last_day()` og policyen `ai_messages_insert_own_user` droppet; nye `ai_limits`-nøgler `chat_messages_per_conversation` og `chat_message_max_chars` (5.3, 5.4, 7.6). |
| `20261021000100_patient_lead_clinics.sql` | `patient_lead_clinics(p_case_id default null)`: navn, by, logo og `removed` for klinikker på patientens egne leads (security definer, kun `authenticated`; 10.9). |
| `20261022000100_leads_daily_limit.sql` | Trigger `leads_daily_limit()`: højst 15 leads pr. patient på 24 timer (7.6, security trin 4). |
| `20261023000100_messages_sender_role.sql` | `messages.sender_id` nullable med `on delete set null`, enum `message_sender_role` og kolonne `sender_role` (udledt af trigger), opdateret update-policy, `clinic_leads()`, `clinic_lead_messages()` og `clinic_mark_messages_read()` bruger `sender_role` (12.3 punkt 30). |
| `20261024000100_clinic_lead_access.sql` | Policyen på `leads` erstattes af `leads_select_case_owner` (kun sagens ejer); ny `clinic_lead_status(p_lead_id)`; kolonne-grant på `messages` uden `sender_id`; `clinic_leads()` tæller kun billeder med aktivt `image_upload`-samtykke i `image_count`, ligesom `clinic_lead_images()` (security trin 5 H1 og L1, review 5). |
| `20261025000100_clinic_lead_detail_unread.sql` | `clinic_lead_detail()` returnerer `unread_messages`, og dens `image_count` tæller kun billeder med aktivt `image_upload`-samtykke som `clinic_leads()` (security 5.5d L1); `clinic_leads()` sorterer kun på akut for leads, der ikke er trukket tilbage (review 5.5c). |
| `20261026000100_booking_reads.sql` | `patient_bookings(p_booking_id default null)` (patientens egne bookinger med klinikkens navn, adresse og by, `reviewed`, `created_at`; effektiv status) og `clinic_booking(p_booking_id)` (én af klinikkens bookinger, samme kontaktregel som `clinic_bookings()`). (6.1). |
| `20261027000100_booking_limit.sql` | `create or replace` af `book_slot()`: afviser den 6. booking på samme lead (alle statusser tælles, også aflyste) med `BOOKING_LIMIT` (409), efter `LEAD_NOT_ACCEPTED`/`CLINIC_NOT_AVAILABLE`. Ellers uændret (signatur, security definer, `search_path = ''`, tjek og grants). Security trin 6, M1 (6.7a). **Ikke kørt i det fælles projekt endnu.** |

**Nedskæring** hvis tiden ikke slår til, i denne rækkefølge: portefølje → klinikkens svar på anmeldelser → beskedtråd → kort (listen er nok) → akutvindue (akutvejen bruger almindelige tider). Skæres **aldrig**: isolation af leads og skjulte kontaktoplysninger (RLS), samtykke før chat/upload/deling, AI-reglerne (ingen priser, ingen klinikanbefaling, akut-henvisning), maks. 3 leads, ingen dobbeltbooking, "Slet min samtale" og oprydning af anonyme data.

---

## 12. Risici, åbne og udskudte beslutninger

### 12.1 Kendte risici

| Risiko | Konsekvens | Afbødning |
|---|---|---|
| Fejl i RLS eller en læsefunktion (fx en ekstra SELECT-policy på `leads` eller `bookings`) | Klinikker ser hinandens leads eller patientdata | Klinikker læser kun via `clinic_*`; tests 1-5 i 5.6; security før merge |
| Ny ejer af en klinik (CVR-overtagelse) ser den tidligere ejers leads, tråde eller patienter | Brud på isolationen | `clinics.owner_since`; klinikadgang kræver `sent_at >= owner_since` og verificeret klinik; test 27 |
| Klinik læser beskeder direkte og får `sender_id` (patientens bruger-id) | Patientidentitet lækker | Ingen klient-SELECT på `messages` for klinikker; `clinic_lead_messages()` uden `sender_id`; test 28 |
| Gamle storage-policies eller buckets bliver liggende i det fælles projekt efter nulstilling | Uventet adgang til filer | Tjek efter 0.8 (2.3.1) |
| Kontaktoplysninger lækker før booking (fx via beskedtråd, DTO, logs eller en join) | Brud på princip 4 | Kontakt kun i `bookings.contact_*`; ingen klient-SELECT på `bookings`; test 5; reviewer tjekker DTO'er |
| Overtagelse af importeret klinik via CVR uden bevis for ejerskab [PROTOTYPE] | Uvedkommende får kontrol over en rigtig kliniks række og kan blokere den rigtige ejers oprettelse (`CLINIC_EXISTS`) | En overtaget klinik er `registered` og dermed usynlig offentligt, indtil admin har verificeret ejeren, så ændringer aldrig når patienter; `cvr` kan ikke ændres; leads kræver verifikation; ejeren af en fejlagtig overtagelse kan fjernes af admin, og så gendannes grunddata og åbningstider fra `clinic_import_snapshots` (4.3), så en uverificeret ejers ændringer aldrig bliver offentlige. Restrisiko: klinikker, der blev overtaget før migrationen `20261016000100`, har intet snapshot. Bevis for ejerskab før overtagelse afklares før rigtige brugere (12.3 punkt 6) |
| Foreløbig vurdering og forklaring af behandlinger | Kan gøre produktet til medicinsk udstyr (MDR) | Fast mærkat, ingen endelige diagnoser, regler samlet i `rules.ts`, faglig vurdering før rigtige patienter (12.4) |
| AI'en nævner priser eller klinikker | Brud på kerneprincip, vildledning | AI'en får ingen pris- eller klinikdata; skema uden felter; filter; provokationstests |
| Akutte tegn overses af AI'en | Patientsikkerhed | Fast akut-indgang på forsiden og i chatten uafhængigt af AI'en; tests med akutte symptomer |
| Porteføljebilleder uden gyldigt samtykke | GDPR art. 9, klinikkens ansvar men vores platform | Bekræftelse med tekstversion og tidspunkt; ingen ansigter; juridisk afklaring (12.4) |
| Ustabilt logout lige efter en gemning (fundet i 1.8: ca. 2 af 10 e2e-kørsler gav 401 efter "Gem profil" og genindlæsning) | Klinikken blev sendt til login | **Rettet i 1.9:** hver request opretter nu kun én auth-kontekst (`createAuthContext()`/`requireTerms()`), som routen giver videre, så sessionen kun verificeres og evt. fornyes ét sted pr. request i stedet for i flere klienter samtidig (refresh token rotation). Midlertidige Auth-fejl (`isTransientAuthError()`) giver 503 `AUTH_UNAVAILABLE` og aldrig 401 eller redirect til login (2.4). Restrisiko: nye routes, der opretter deres egen klient, genintroducerer fejlen; reviewer tjekker 2.1-mønstret |
| Mange uploads fra en klinikkonto (logo, portrætter, portefølje) | Lagerplads og CPU (sharp) | IP-rate limit 10 pr. time, lofterne pr. klinik (7.6), maks. filstørrelse, kun permanente klinikkonti |
| Admin ændrer kataloget direkte i databasen | En slettet eller fejlagtigt deaktiveret behandling kan bryde priser og sager | Rækker deaktiveres i stedet for at slettes (FK'er forhindrer sletning); akut-typen håndhæves af trigger; adminside med validering [UDSKUDT] |
| Dobbeltbooking ved samtidige kald | To patienter får samme tid | Udelukkelse i databasen, ikke kun tjek i koden; test 7 |
| Klinikken markerer et besøg som udeblevet for at undgå en anmeldelse | Skæve anmeldelser | `no_show` kan kun sættes inden for 24 timer efter sluttid; tidspunktet gemmes (`no_show_at`) og kan følges op |
| Ubesvarede leads | Patienten venter | Patienten kan trække et ubesvaret lead tilbage og vælge en anden klinik; intet automatisk udløb |
| Mange leads pr. sag over tid (afvis/træk tilbage og send igen) | Spam af klinikker | Samme klinik kan ikke få sagen to gange; højst 10 leads i alt pr. sag |
| Reserveret akuttid uden svar | Tiden er blokeret for andre patienter | Reservationen udløber efter 30 minutter (eller ved starttid), håndhævet i databasen uden cronjob; frigives også ved afvisning og tilbagetrækning |
| Udløb af reservationer afhænger af, at alle skrivende bookingfunktioner kalder `release_expired_holds()` | En udløbet reservation kunne blokere en ny booking | Krav til migrationen; RLS-test 21 |
| Misbrug af anonyme sessioner | Omkostning, lagring | IP-rate limit, lofter, globalt AI-loft, 48 timers sletning; Turnstile [UDSKUDT] |
| Anonyme helbredsdata uden kontoforhold | GDPR art. 9 | Samtykke før session, minimering, 48 timer, slet med ét klik, oprydningsjob |
| Vilkårs-accept forveksles med samtykke | Ugyldigt grundlag | Separate tabeller, API-test (5.6) |
| Service role-funktioner kaldt med forkerte parametre | Skrivning på en andens sag | Funktionerne tager `p_user_id` og tjekker ejerskab og tilstand selv (5.1 regel 8); tests 14-15 |
| Kortfliser fra OSM's offentlige server | Brugspolitik, CSP | [PROTOTYPE]; egen udbyder før drift |
| Prisnøjagtighed på få anmeldelser | Misvisende | Minimum 3 |
| Manuel Trustpilot-score | Vildledning | "Angivet af klinikken" + dato + link, adskilt fra egne anmeldelser |
| Stram tidsplan og stor omlægning | Ufærdige flows ved fremvisning; i en periode kan appen mindre end i dag | Bred før dyb, nedskæringsrækkefølge (11), samlet oprydning af den gamle kode (12.5), så hvert trin bygger på en kerne, der kompilerer |
| Next.js 16 (`proxy.ts`) | Forvirring for agenter | Læs `node_modules/next/dist/docs/` før kode |

### 12.2 Låste beslutninger

| Beslutning | Afsnit |
|---|---|
| Supabase i EU-region | 2.3 |
| MVC-lag med ESLint-håndhævede importregler; `app/` er kun routing | 2.1, 2.2 |
| Klinikken er kontoen; tandlæger er kun visning | 3, 4.3 |
| Klinikstatus `imported` / `registered` / `verified` / `removed`; kun `verified` modtager leads og bookinger; offentligt vises kun `verified` og `imported` uden ejer; `removed` er endelig og skjult overalt | 3, 4.2, 5.1, 6.6 |
| Ydelseskatalog i databasen; prisliste pr. ydelse med interval og varighed | 4.3 |
| Maks. 3 aktive leads pr. sag, valgt af patienten; afviste og tilbagetrukne tæller ikke; konto og delingssamtykke kræves | 4.3, 5.3 |
| Patienten kan trække et ubesvaret lead tilbage; leads udløber ikke | 4.2, 5.3 |
| Beskedtråden er åben fra leadet er sendt; kontaktoplysninger er skjult til booking, derefter ser klinikken navn, telefon og e-mail | 4.3, 4.4 |
| Booking er gennemført automatisk 24 timer efter sluttid, medmindre klinikken inden da har markeret udeblivelse; anmeldelse først derefter | 4.2, 8.1 |
| Akutvejen kræver login; den valgte tid reserveres straks i højst 30 minutter (eller til starttid), bliver en booking ved accept og frigives ved afvisning, tilbagetrækning eller udløb | 4.3, 6.1 |
| Højst 3 aktive og højst 10 leads i alt pr. sag | 4.3, 5.3 |
| Klinikken mister adgang til sagens indhold og tråd, når patienten trækker leadet tilbage | 4.4, 5.7 |
| Lukning af en sag (`close_case()`) og tilbagetrækning af delingssamtykke trækker ubesvarede og ubookede leads tilbage og frigiver reservationer; bookede tider består | 4.2, 5.3 |
| En klinik, der sletter sin konto: åbne leads afvises med `clinic_left`, og fremtidige bookinger aflyses. En importeret klinik bliver `imported`; offentlige grunddata (navn, adresse, postnummer, by, telefon, åbningstider, admin-indtastet Trustpilot) bevares, og alt klinikindtastet indhold slettes. En klinik, der oprettede sig selv, bliver `removed`: skjult overalt, CVR nulstillet, kun navn og adresse bevares; patienternes historik består. Klinikrækker slettes aldrig | 4.2, 5.3, 10.8 |
| Logo og tandlægeportrætter har versionerede URL'er (`?v=`) | 9.5 |
| Bookinger starter på hele kvarterer, håndhævet i databasen (check constraint) | 4.2, 6.7 |
| Klinikkens adgang er tidsafgrænset af `owner_since` og kræver verificeret klinik; klinikker læser beskeder kun via `clinic_lead_messages()` | 4.3, 5.1, 5.7 |
| Patienter sletter ikke sager direkte; kladder slettes af serveren med service role | 5.4, 10.5 |
| Konstanter, som databasen håndhæver, står både i SQL og i `lib/constants/` og ændres samtidig | 7.6 |
| Offentligt vises kun verificerede klinikker (fuldt niveau) og importerede klinikker uden ejer (basisniveau med Trustpilot, uden egne anmeldelser). `registered` er usynlig, også efter CVR-overtagelse | 3, 5.1, 6.6, 8.4 |
| Kontaktoplysninger kun i `bookings`, kun synlige for klinikken ved `booked`/`completed` | 4.4, 5.5 |
| Klinikker læser kun via `clinic_*`-funktioner; offentlige klinikdata kun via `public_*` | 5.1, 5.7 |
| Ingen dobbeltbooking, håndhævet med udelukkelse i databasen; én kalender pr. klinik [PROTOTYPE] | 4.3 |
| Anmeldelse kun efter gennemført booking; prisoverslag = præciseret pris ellers listepris-snapshot | 8 |
| AI'en nævner aldrig priser og anbefaler aldrig klinikker; rangering efter faste, synlige kriterier i `RankingService` | 6.6, 7.3 |
| Objektorienteret backend: repositories (arver `BaseRepository`), services og controllers er klasser uden tilstand på tværs af requests; middleware, `lib/`, routes, sider og komponenter er funktioner | 2.1, 2.1.1 |
| AI-reglerne samlet i `services/ai/rules.ts` | 7.8 |
| Anonym chat via Supabase anonymous sign-in; samme bruger-id ved konvertering; 48 timers sletning | 7.7 |
| Billedsamtykke kun lige før første upload | 9.4 |
| Billeder skrives kun med service role efter re-encoding; `case-images` har ingen klientpolicies; signering med service role efter RLS-beskyttet læsning | 9.2 |
| Service role-funktioner bruger ikke `auth.uid()` | 5.1 |
| Tests kører mod lokal Supabase | 2.3.1, 5.6 |

### 12.3 Åbne beslutninger [ÅBEN]

1. *Afklaret:* ubesvarede leads udløber ikke; patienten kan trække et ubesvaret lead tilbage (`withdrawn`), så pladsen bliver fri (4.2, 5.3).
2. *Afklaret:* afviste og tilbagetrukne leads tæller ikke med i de 3; kun aktive leads (`sent`, `accepted`, `booked`) tæller (4.3).
3. *Afklaret:* akutvejen kræver login. Den valgte tid reserveres straks (`held`), bliver en booking ved accept og frigives ved afvisning (4.3, 5.3, 6.1).
4. *Afklaret:* en booking er gennemført automatisk efter sluttid, medmindre klinikken har markeret udeblivelse (4.2, 8.1).
5. *Afklaret:* importerede klinikker viser kun Trustpilot (hvis kendt), ingen egne anmeldelser; egne anmeldelser kun for verificerede klinikker (6.6, 8.4).
6. **Kilde til import** af klinikker (CVR, Sundhedsstyrelsen, andet) og **overtagelse** af en importeret klinik: hvordan beviser en klinik, at den ejer rækken?
7. **Kalender:** én kalender pr. klinik (kun én booking ad gangen) er en forenkling. Skal kapaciteten være pr. tandlæge/stol, eller et tal pr. klinik?
8. *Afklaret:* beskedtråden er åben fra leadet er sendt, så klinikken kan stille afklarende spørgsmål før accept; kontaktoplysninger er stadig skjult til booking (4.3).
9. *Afklaret:* kataloget har to niveauer, kategorier og behandlinger. Startindholdet står i `docs/behandlingskatalog.md`, og bagefter vedligeholdes det i databasen uden kodeændringer (4.3).
10. *Afklaret:* klinikken ser både telefon og e-mail efter booking (4.4). Oprettede, men ikke verificerede klinikker er usynlige offentligt (ændret ved securitygennemgangen af trin 1, H1; 3, 5.1).
11. **Porteføljebilleder:** krav til samtykket (skriftligt, opbevares af klinikken), og må billeder vise ansigt?
12. **Standardsortering:** afstand med position, ellers første ledige tid. Ønsker gruppen en anden standard?
13. **Præcis geokodning** af klinikadresser (i dag postnummerets centrum, hvis importen ikke har koordinater).
14. **Præcis fremvisningsdato** og hosting af Next.js-appen.
15. **Ønsket tidsrum:** er de fire faste valg (hurtigst muligt, inden for 2 uger, inden for 3 måneder, fleksibel) nok, eller ønskes konkrete datoer?
16. *Afklaret:* klinikken har 24 timer efter sluttid til at markere `no_show`; først derefter er bookingen effektivt `completed`, og først derefter kan der anmeldes (4.2, 5.3, 8.1).
17. *Afklaret:* højst 10 leads i alt pr. sag uanset status, ud over loftet på 3 aktive. Patienten kan altid starte en ny sag (4.3, 5.3).
18. *Afklaret:* en reserveret akuttid (`held`) udløber efter 30 minutter uden svar, eller ved starttid, hvis den kommer før. Udløbet håndhæves i databasen uden cronjob (`hold_expires_at`, `release_expired_holds()`, effektiv status, 4.3). Accept efter udløb giver et accepteret lead uden booking.
19. *Afklaret:* Trustpilot for importerede klinikker indtastes manuelt af TandMatch (admin/seed) i prototypen; rigtig løsning er [UDSKUDT] (12.4).
20. *Afklaret:* klinikken mister adgangen til sagens indhold og beskedtråd, når patienten trækker leadet tilbage (4.4, 5.7).
21. *Afklaret:* lukning af en sag: `close_case()` trækker `sent` og ubookede `accepted` leads tilbage, frigiver reservationer og lader bookede tider bestå (5.3, 10.5).
22. *Afklaret:* booking-starttider skal ligge på hele kvarterer, håndhævet i databasen (`SLOT_STEP_MINUTES = 15`, 4.2).
23. *Afklaret:* tilbagetrækning af `health_data_sharing` trækker patientens `sent` og ubookede `accepted` leads tilbage og frigiver reservationer; bookede tider består og kan aflyses af patienten (5.3).
24. *Afklaret:* når en klinik sletter sin konto, afvises åbne leads med `clinic_left`, reservationer frigives, og fremtidige bookinger aflyses. En importeret klinik bliver `imported`: navn, adresse, postnummer, by, telefon og åbningstider bevares; prisliste, blokeringer, beskrivelse, tandlæger, portefølje, logo, e-mail, website og klinikindtastet Trustpilot slettes. En klinik, der oprettede sig selv (`import_source is null`), bliver `removed` (punkt 28; 5.3, 10.8).
25. *Afklaret:* klinikkernes uploads får samme IP-rate limit som patienters billedupload, 10 pr. time pr. IP (10.8, 1.9).
26. *Afklaret:* sletning af klinikkonto sletter også e-mail og website, og rækkeoprydningen ligger i triggeren `clinics_after_owner_removed()` (5.3, 1.9).
27. *Afklaret:* klinikcontrollerne deler logik ved komposition, ikke en fælles basisklasse (2.1.1).
28. *Afklaret:* en selvoprettet klinik, der mister sin ejer, slettes ikke, men får status `removed`. Den er skjult overalt og kan ikke vælges eller overtages; CVR nulstilles, så virksomheden kan oprette sig igen. Klinikindtastet indhold ryddes, og navnet bevares. Patienternes leads, beskeder, bookinger og anmeldelser bevares, og patienten ser "Klinikken er ikke længere på TandMatch". Anmeldelserne forsvinder fra offentligheden, men patienten kan se sin egen (4.2, 5.3).
29. *Afklaret:* offentligt vises kun `verified` og `imported` uden ejer; `registered` er usynlig, også efter CVR-overtagelse (5.1 regel 11).
30. **Klinikkens beskeder ved sletning af klinikkonto (security L6):** `messages.sender_id` har `on delete cascade`, så klinikkens beskeder forsvinder fra patientens tråd, når klinikkontoen slettes. Det strider mod beslutningen om, at patientens historik bevares (punkt 28). **Besluttet (2026-10-18):** `on delete set null` og en `sender_role`-kolonne (`patient`/`clinic`), så tråden viser "Klinikken" for beskeder uden afsender. Bygges med beskedtråden (5.2) i en ny migration; eksisterende rækker får `sender_role` ud fra afsenderens rolle.
31. **Forretningsmodel:** prototypen og siden "Sådan tjener vi penge" siger, at klinikker betaler for leads, og at patienter ikke betaler. Pris pr. lead, abonnement, betaling ved booking eller andet er ikke besluttet, og der er ingen betaling i koden.
32. **API-test til trin 6:** *Bookingdelen er løst (6.1):* `tests/api/bookings.test.ts` tester en ikke-udløbet og en udløbet `held`-booking gennem API'et. *Anmeldelsesdelen er løst (6.2):* `tests/api/reviews.test.ts` godkender en anmeldelse med service role lokalt og tester, at den vises i `GET /api/clinics/{id}/reviews` og påvirker prisnøjagtigheden.

### 12.4 Udskudt [UDSKUDT]

1. Databehandleraftale med OpenAI og overførsel til USA.
2. Fagligt review af MDR (foreløbig vurdering, forklaring af behandlinger, billedbeskrivelser).
3. Brugervilkår, privatlivspolitik og samtykketekster (inkl. deling af kontakt ved booking og portefølje).
4. Opbevaringsperiode og automatisk sletning af kontodata.
5. Streaming, realtime, notifikationer.
6. CAPTCHA og e-mailbekræftelse.
7. Overtagelse af anonym samtale ved login på eksisterende konto.
8. Adminside til moderation, verifikation og import.
9. Egen kortfliseudbyder.
10. Reklameregler for klinikkernes priser og profiler.
11. Trustpilot-data for importerede klinikker: rigtig kilde og opdatering (i prototypen indtaster TandMatch dem manuelt; scraping er ikke tilladt).
12. Juridisk gennemgang af klinikkens porteføljeerklæring (`PORTFOLIO_CONSENT_TEXT_VERSION`, pladsholdertekst, 9.5).
13. Prisforslag til klinikken i prislisten (fx typisk prisniveau pr. behandling). I prototypen skriver klinikken selv prisen.
14. Adminside til vedligeholdelse af behandlingskataloget.

### 12.5 Overgang fra den gamle model

Den gamle model (forespørgsler, tandlæger, svar, standard-spor) er fjernet fra koden i opgave 0.9 (commit `33d066f1`), og den genbrugte kerne er omskrevet til klasser i opgave 0.10. Indtil omlægningen er færdig, gælder:
- Kode fra den gamle model, der kan genbruges, hentes fra git (`e5cf7a04`), når afløseren bygges, og skrives om til klasser. Der er aldrig to versioner af samme ting.
- `docs/omlaegning.md` er arbejdsredskabet for, hvad der genbruges; den slettes, når omlægningen er færdig.
- Den gamle fejl i `try_consume_anonymous_ai_call()` (brugte `auth.uid()` under service role) er løst i det nye migrationssæt (5.1 regel 8, 5.3).
