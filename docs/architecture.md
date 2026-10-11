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
- **Overgang:** koden implementerer i dag den gamle forespørgsels- og tandlægemodel. `docs/omlaegning.md` viser, hvad der genbruges, tilpasses, erstattes og slettes, og `docs/arbejdsplan.md` fordeler arbejdet. Infrastrukturen (2.1-2.5, vilkårs-gate, anonym session 7.7, billedbehandling 9.3, AI-klienten) findes og genbruges; domænet (afsnit 3-10) er [IKKE BYGGET], medmindre andet står.
- Samlet liste over åbne og udskudte punkter i afsnit 12.

### 0.1 Prototype-status

TandMatch er en **prototype** til fremvisning. Alt kan ændres senere, men følgende må ikke gå på kompromis selv i prototypen: klinikker ser aldrig hinandens leads, svar, bookinger eller patienter (RLS); klinikken ser ikke patientens identitet før accepteret lead og booket tid; AI'en nævner aldrig priser og anbefaler aldrig en klinik; samtykke før AI-behandling, billedupload og deling; helbredsdata er aldrig offentligt tilgængelige.

Bevidste prototype-kompromiser [PROTOTYPE]:

| Kompromis | Hvorfor | Hvad en rigtig løsning kræver |
|---|---|---|
| Klinikker verificeres kun i seed-data (`admin_set_clinic_status()`); ingen adminside | Tidsplan | Verifikationsflow (CVR, autorisation) og adminside |
| Importerede klinikker kommer fra seed-data | Importkilde ikke valgt | Import fra CVR eller andet register (12.3) |
| En klinik, der opretter sig med et CVR-nummer, som en importeret klinik har, overtager den importerede række uden bevis for ejerskab | Enkelt demoflow | Bevis for ejerskab før overtagelse; verifikation før leads er værnet i dag (12.1) |
| Én kalender pr. klinik: kun én booking ad gangen | Enkel dobbeltbookingsregel | Kalender pr. behandler eller stol (12.3) |
| Ingen e-mailbekræftelse ved kontooprettelse | Enkelt demoflow | Slå e-mailbekræftelse til i Supabase |
| Ingen CAPTCHA på anonyme sessioner; kun rate limits og lofter | Enkelt demoflow | Cloudflare Turnstile |
| En patient med eksisterende konto kan ikke overtage en anonym samtale ved login (kun ny konto) | Undgår flytning af data mellem brugere | Sikker overtagelse via service role (7.7) |
| Oprydning af anonyme sessioner køres af planlagt job eller manuelt | Hosting ikke valgt | Fast planlagt job |
| Polling i stedet for realtime | Enkelhed | Supabase Realtime |
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
| Routing | `app/` | `page.tsx` re-eksporterer en side fra `views/pages/`. `layout.tsx` kalder områdevagten (`guardArea`/`guardCaseFlow`). `route.ts`: (1) `requireTerms()`, (2) `requireSession()`/`requireRole()`/`requireAnonymous()`/`requireAccount()`, (3) evt. `enforceIpRateLimit()`, (4) `parseId`/`readJson`/`readQuery`, (5) opretter controlleren og kalder **én** metode (`new LeadsController(supabase, session).decide(id, input)`), (6) returnerer JSON. Cookies sættes og slettes her (vilkårs-cookien, `clearAuthCookies()` efter sletning). Undtagelser: `/api/session/anonymous` rate-limiter efter validering, fordi grænsen kun gælder uden session; billedupload sender en læser (`imageFileReader`) til controlleren, så filen først læses efter samtykke- og ejertjekket (9.3). Ingen forretningslogik og ingen modelkald. | `middleware/`, `controllers/`, `views/`, `lib/`, og fra `models/` kun `createSupabaseServerClient` |
| Middleware | `middleware/` | Tværgående request-håndtering: `http.ts` (`ApiError`, `withApi`, `readJson`, `readQuery`, `rejectLargeImage`, `imageFileReader`, `parseId`, `jsonResponse`, `noContent`), `session.ts` (`getSession`, `requireSession`, `requireRole`, `requireAnonymous`, `requireAccount`, `clearAuthCookies`), `termsGate.ts`, `termsCookie.ts`, `rateLimit.ts`, `cron.ts`, `areaGuard.ts` (`guardArea`, `guardCaseFlow`). Funktioner, ikke klasser. Ejerskab af en ressource tjekkes ikke her, men i repositories (`require*`). | `models/`, `lib/` |
| Controller | `controllers/` | Én klasse pr. ressource (`LeadsController` i `leadsController.ts`). **Oprettes pr. request** med `(supabase, session)` og opretter selv de repositories og services, den bruger (2.1.1). Metoderne tager **typet, valideret input** (aldrig `Request`, aldrig cookies), tjekker forretningsregler, kalder repositories og services og returnerer DTO'er. Controllers kalder ikke hinanden; delt logik flyttes til en service. Opretter kun admin-klienten i de tilfælde, der står i 2.3, og giver den videre til det repository, der skal bruge den. | `models/`, `services/`, `middleware/http`, `lib/` |
| Service | `services/` | Klasser med afhængigheder i constructoren: `RankingService` (sortering og filtrering efter faste kriterier, 6.6), `AvailabilityService` (ledige tider, 6.7), `ai/AiChatService` og `ai/AiSummaryService` (OpenAI-klient og `AI_RULES`), `ImageProcessingService` (sharp: filtype, re-encoding, EXIF fjernes), `AccountDeletionService`. Controlleren kalder fx `chatService.sendTurn(...)` eller `rankingService.rank(...)` og kender ikke detaljerne. Rene hjælpefunktioner (PII-maskering, ordfilter, promptformat) må være funktioner. | `models/`, `lib/`, `middleware/http` (kun `ApiError`) |
| Model | `models/` | **Repository-klasser**, én pr. tabel/aggregat (`CasesRepository` i `casesRepository.ts`), plus `AuthRepository` (Supabase Auth) og storage-repositories (`CaseImageStorage`, `PublicMediaStorage`). Alle arver `BaseRepository` (`models/base/baseRepository.ts`) og får Supabase-klienten i constructoren (`new CasesRepository(supabase)`). **Eneste lag, der kalder Supabase.** Metoder med faste navne: `findById`, `findOwn`, `list…`, `create`, `update`, `delete`, `require…` (find eller kast 404/403), og ét navngivet kald pr. RPC (`sendLeads(...)`). Bruger brugerens JWT, så RLS altid gælder, medmindre controlleren har givet admin-klienten (2.3). `models/db/` har klientfabrikkerne (`createSupabaseServerClient`, `createSupabaseAdminClient`), env-konfiguration og `mapDbError` (funktioner). | `models/base/`, `models/db/`, `middleware/http` (kun `ApiError`), `lib/` |
| View | `views/` | `views/pages/` (sideindhold), `views/components/` (UI) og `views/utils/` (`api-client.ts`, `api-errors.ts`, `field-errors.ts`, `format.ts`, `map.ts`). Henter og skriver **kun** via `/api/*` med `views/utils/api-client`. | `views/`, `lib/` |
| Delt | `lib/` | Kode uden afhængigheder til andre lag, brugt af både views og server: `types/` (DTO'er, én fil pr. domæne), `schemas/` (zod, én fil pr. domæne), `constants/` (én fil pr. domæne med både værdier og danske visningsnavne), `navigation/`, `domain/` (regler der skal være ens i UI og server). | `lib/` |

- Alle filer i `middleware/`, `controllers/`, `services/` og `models/` starter med `import "server-only"`. Undtaget er ren kode uden I/O, som testes direkte: i `services/ai/` (`rules.ts`, `errors.ts`, `forbiddenTerms.ts`, `guard.ts`, `pii.ts`, `promptFormat.ts`, `schemas.ts`, `prompts/`) samt `services/rankingService.ts` og `services/availabilityService.ts`. De må ikke importere models eller kalde netværk.
- Reglerne i kolonnen "Må importere" håndhæves af ESLint (`no-restricted-imports` i `eslint.config.mjs`). Type-imports er tilladt på tværs af lag. Imports bruger `@/...`; relative imports op ad træet (`../`) er forbudt.
- Kode, der kun bruges af views, hører til i `views/utils/`, ikke i `lib/` (fx kortopsætning i `views/utils/map.ts`).
- Login/logout, anonym session og konvertering til konto går via API'et (`/api/auth/*`, `/api/session/*`), så sessionen sættes som cookie af serveren.
- **Navngivning:** serverlagene bruger `camelCase`-filnavne, og hver klassefil eksporterer præcis én klasse med samme navn i PascalCase: `casesRepository.ts` → `CasesRepository`, `leadsController.ts` → `LeadsController`, `rankingService.ts` → `RankingService`. Repositories hedder efter tabellen i flertal, controllers efter ressourcen, services efter ansvaret. `views/` og `lib/` bruger `kebab-case` (`clinic-card.tsx`). Ressourcenavne på engelsk i kode og API (`case`, `lead`, `booking`, `clinic`, `service`), danske slugs i sider (`/klinikker`, `/sag`). Sagen hedder `case` i kode og `cases` i databasen; da `case` er et reserveret ord i TypeScript, bruges `caseRow`/`patientCase` som variabelnavne.
- **Ét sted pr. domæne:** hver ressource har højst én fil i hver af `lib/types/`, `lib/schemas/` og `lib/constants/` med samme navn (`leads.ts`). Statusser, enum-værdier og deres danske visningsnavne står kun i `lib/constants/`. Ingen dubletter i komponenter.
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

**Afhængigheder gives i constructoren.** En klasse opretter ikke skjult sine afhængigheder inde i metoderne. Controllere får `(supabase, session)` og bygger deres repositories og services i constructoren; et valgfrit tredje argument med afhængigheder må bruges i tests. Services får deres afhængigheder direkte (`new AiChatService(openAiClient, AI_RULES)`, `new AvailabilityService(constants)`).

**Ingen tilstand på tværs af requests.** Instanser oprettes pr. request og kasseres bagefter. Der må ikke være modul-singletons med en Supabase-klient, en session eller brugerdata, og ingen statiske felter med muterbar tilstand. Uforanderlig konfiguration (konstanter, `AI_RULES`, en OpenAI-klient uden brugerdata) må deles.

**Arv og genbrug:** arv kun fra basisklasserne i `models/base/`. Ellers bruges komposition (en controller har repositories og services som felter). Controllere har ingen fælles basisklasse, før der opstår reel gentagelse; så beskrives den her først (`controllers/base/`).

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
                             openai.ts (klientfabrik), rules.ts (AI_RULES, 7.8), catalogContext.ts,
                             guard.ts, forbiddenTerms.ts, pii.ts, schemas.ts, errors.ts, promptFormat.ts, prompts/
  rankingService.ts          RankingService: sortering og filtrering af klinikker (6.6), ingen I/O
  availabilityService.ts     AvailabilityService: ledige tider (6.7), ingen I/O
  imageProcessingService.ts  ImageProcessingService: sharp, filtype, re-encoding, EXIF fjernes
  accountDeletionService.ts  AccountDeletionService: sletning af konto, billedfiler og auth-bruger
models/
  base/                      baseRepository.ts (BaseRepository), baseStorage.ts (BaseStorage)
  db/                        supabase.ts (brugerens JWT), admin.ts (service role, kun 2.3), config.ts, errors.ts (funktioner)
  authRepository.ts, profilesRepository.ts, patientsRepository.ts, termsRepository.ts, consentsRepository.ts,
  rateLimitRepository.ts, cleanupRepository.ts
  servicesRepository.ts, casesRepository.ts, caseImagesRepository.ts, chatRepository.ts
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
    clinic-directory/        offentlig oversigt og profil: klinikkort, filtre, kort (Leaflet), sammenligning,
                             Trustpilot, stjerner, anmeldelser, portefølje
    clinic/                  klinikområdet: lead-indbakke, lead-kort, beslutning, profil-, prisliste-,
                             åbningstids- og tandlægeformularer, portefølje, kalender, anmeldelser
    patient/                 mine sager, leads, booking, bookinger, samtykker, eksport, anmeldelser
    messages/                beskedtråd pr. lead
    emergency/               akutvejen
  utils/                     api-client.ts, api-errors.ts, field-errors.ts, format.ts, map.ts
lib/
  types/                     common, auth, consents, patients, ai, services, cases, clinics, leads, bookings,
                             messages, reviews
  schemas/                   samme domæner som types (+ session, terms)
  constants/                 consents, legal, limits, sessions, ai-texts, services, cases, clinics, leads,
                             bookings, reviews
  navigation/                områder og sikre redirect-stier
  domain/                    regler delt af UI og server: leads.ts (fx canSendMoreLeads), bookings.ts (fx canCancel)
supabase/
  config.toml                lokal Supabase (anonyme logins til, e-mailbekræftelse fra)
  migrations/                det samlede sæt (11)
  seed.sql                   kun referencedata, som ikke kræver auth-brugere (postnumre)
tests/
  ai/                        provokationstests for chat og opsummering
  rls/                       RLS-tests (5.6), køres mod lokal Supabase
  unit/                      rene funktioner: ranking, availability, prisnøjagtighed, AI-guard
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

Samme indstillinger står i `supabase/config.toml`, så lokal Supabase (`supabase start`, `supabase db reset`) svarer til det fælles projekt. Tests kører altid lokalt, aldrig mod det fælles projekt.

### 2.4 Fælles API-konventioner

- JSON ind og ud. Tidspunkter som ISO 8601-strenge (UTC). Ugedage og klokkeslæt i åbningstider er lokal tid i `Europe/Copenhagen`. Beløb i hele kroner (`integer`, DKK). Varighed i minutter.
- Feltnavne i JSON: `camelCase`. Kolonner i databasen: `snake_case`. Mapping sker i `models/`.
- Fejlformat for alle routes:
  ```ts
  type ApiError = { error: { code: string; message: string } }; // message på dansk, uden interne detaljer
  ```
- Statuskoder: 200, 201, 204, 400 (validering), 401 (ikke logget ind), 403 (forkert rolle/ejer/manglende samtykke), 404 (findes ikke **eller** ingen adgang; vi skelner ikke), 409 (forkert tilstand, fx lead ikke accepteret, tiden er taget), 413 (fil for stor), 429 (rate limit eller loft), 500.
- Auth: Supabase Auth med `@supabase/ssr`, session i `httpOnly`, `secure`, `sameSite=lax`-cookies sat af serveren. Browseren bruger aldrig Supabase-klienten selv.
- Ingen streaming. Alle svar, også AI-svar, returneres som ét samlet JSON-svar efter validering.
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
| 7 | Route | `app/api/<x>/route.ts` | Kun: `requireTerms` → session/rolle → evt. rate limit → parse input → `new XController(supabase, session).metode(input)` → JSON |
| 8 | Side | `views/pages/<rute>/page.tsx` + `app/<rute>/page.tsx` | Siden henter via `views/utils/api-client`. `app/` re-eksporterer kun |
| 9 | Test og review | `tests/rls/`, `tests/unit/`, `tests/ai/`, `tests/e2e/` | RLS-test for nye policies (5.6), enhedstest af services (afhængigheder erstattes via constructoren), AI-tests ved promptændringer. Kør `npx tsc --noEmit`, `npm run lint`, `npm run build`, derefter reviewer og tester |

Et kald gennem lagene, fx `POST /api/leads/{id}/decision`:

```
views/components/clinic/lead-decision.tsx  apiRequest(`/api/leads/${id}/decision`, { method: "POST", body })
app/api/leads/[id]/decision/route.ts       requireTerms() → requireRole("clinic") → parseId() → readJson(req, leadDecisionSchema)
                                           → new LeadsController(supabase, session).decide(leadId, input)
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

## 3. Roller og rettigheder [IKKE BYGGET]

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
| `imported` | nej | grunddata og Trustpilot, hvis kendt (6.6, niveau "basis"). Ingen egne anmeldelser | nej |
| `registered` | ja | som `imported` (basis) [PROTOTYPE]. Klinikken kan udfylde profil, prisliste, åbningstider, tandlæger og portefølje og se en forhåndsvisning | nej |
| `verified` | ja | fuld profil (niveau "fuld"): priser, ledige tider, tandlæger, portefølje, egne anmeldelser og prisnøjagtighed, kan vælges | ja |

Status ændres kun af admin (eller seed via `admin_set_clinic_status()`, 5.3). Den præcise visuelle udformning af basisniveauet designes senere.

| Handling | Besøgende | Anonym patient | Patient | Klinik | Admin |
|---|---|---|---|---|---|
| Se klinikoversigt, kort, profiler, godkendte anmeldelser og svar | ja | ja | ja | ja | ja |
| Starte chat (giver AI-samtykke → anonym session) | ja | | | | |
| Chatte med AI'en, uploade billeder (med samtykke), bekræfte ydelser, godkende opsummering | | ja, egen kladde (max 1) | ja, egne sager | | |
| **Sende leads** (op til 3 aktive pr. sag, 4.3) | | **nej, skal oprette konto** | ja | | |
| Trække et ubesvaret lead tilbage (status `sent`) | | | egne | | |
| Se en sag (opsummering, ydelser, billeder) | | egen | egne | kun via egne leads, og kun når sagen er sendt til klinikken | nej |
| Se AI-chatten | | egen | egne | **aldrig** | nej |
| Se leads | | | alle på egne sager | **kun egne leads** | nej |
| Accepter / afvis lead | | | | egne leads | |
| Booke tid | | | på egne accepterede leads | | |
| Se patientens navn og kontaktoplysninger | | | egne | **kun for egne bookinger med status `booked`/`completed`** | nej |
| Aflyse booking | | | egne, før starttid | egne, før starttid | |
| Markere booking som udeblevet (`no_show`) | | | | egne, mellem start- og sluttid. Ellers bliver bookingen automatisk gennemført efter sluttid | |
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

## 4. Datamodel [IKKE BYGGET]

Alle tabeller ligger i `public`, har `id uuid primary key default gen_random_uuid()` (medmindre andet står), `created_at timestamptz not null default now()`, og **RLS er slået til på alle tabeller**. Enums er Postgres-enums. Det hele oprettes af det samlede migrationssæt (11).

### 4.1 Relationsoverblik

```
auth.users 1─1 profiles 1─1 patients
                        1─0..1 clinics (owner_id; importerede klinikker har ingen ejer)

profiles 1─n terms_acceptances                        (vilkårs-accept; IKKE samtykke)
patients 1─n consents                                 (GDPR art. 9-samtykker)

services (katalog)
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
clinic_status        = 'imported' | 'registered' | 'verified'
service_category     = 'cosmetic' | 'general' | 'emergency'
case_status          = 'draft' | 'submitted' | 'closed'
case_timeframe       = 'asap' | 'within_2_weeks' | 'within_3_months' | 'flexible'
lead_status          = 'sent' | 'accepted' | 'declined' | 'booked' | 'withdrawn'
lead_decline_reason  = 'no_capacity' | 'not_offered' | 'needs_referral' | 'other'
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
- `case_status`: `draft → submitted` (første lead sendt; indhold låses) `→ closed` (patienten lukker). Kun `draft` kan redigeres.
- `lead_status`: `sent → accepted | declined` (klinikken, `clinic_decide_lead()`) eller `sent → withdrawn` (patienten, `withdraw_lead()`); `accepted → booked` (booking oprettet); `booked → accepted` (booking aflyst). `declined` og `withdrawn` er endelige. **Aktive leads** = `sent`, `accepted`, `booked`; kun de tæller med i loftet på 3 pr. sag.
- `booking_status`: `held` (kun akut: tiden er reserveret, mens leadet venter) `→ booked` (klinikken accepterer) eller `→ cancelled` (klinikken afviser, patienten trækker leadet tilbage, eller starttiden passeres uden svar). `booked → cancelled` (patient eller klinik, før starttid), `booked → no_show` (klinikken, mellem start- og sluttid), ellers `booked → completed` automatisk efter sluttid. `completed`, `no_show` og `cancelled` er endelige.
- **Effektiv status:** en booking med `status = 'booked'` og `ends_at <= now()` **er** gennemført, også før rækken er opdateret. Ligeledes er en `held`-booking med `starts_at <= now()` frigivet. Alle policies og læsefunktioner bruger `booking_effective_status()` (5.2), så korrektheden ikke afhænger af et planlagt job. Jobbet `complete_due_bookings()` skriver blot den effektive status ned (5.3).

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
- `ai_limits`, `ai_usage_daily`, `ai_patient_usage_daily`, `rate_limits`: ingen brugeradgang; kun funktioner og service role (7.6). Indhold som før: lofter som nøgle/værdi, daglig tæller for anonyme AI-kald (ingen persondata), udkast pr. patient pr. døgn, forsøg pr. bucket og IP-hash.

#### `services` (ydelseskatalog)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| slug | text not null unique | Stabil nøgle, fx `undersoegelse`, `blegning`, `akut_konsultation`. Bruges af AI'en og i URL-filtre |
| name | text not null | Dansk navn |
| description | text not null | Kort, neutral forklaring til patienten. Må bruges af AI'en, når den forklarer behandlinger |
| category | service_category not null | Kosmetisk, almindelig eller akut |
| default_duration_min | smallint not null | Bruges, hvis klinikken ikke har angivet varighed. check 5-480 |
| sort_order | smallint not null default 0 | |
| is_active | boolean not null default true | Inaktive ydelser kan ikke vælges eller foreslås |

Kataloget oprettes med startindhold i migrationen (det er referencedata, appen virker ikke uden). Indholdet er en pladsholder [ÅBEN] (12.3). Kataloget skal mindst indeholde `undersoegelse` (bruges, når patienten er usikker, 7.3) og én ydelse i kategorien `emergency` (akutvejen). Slugs, som koden afhænger af, står i `lib/constants/services.ts` (`EXAMINATION_SERVICE_SLUG`). Kun admin/migration skriver.

#### `clinics`
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid FK profiles on delete set null, **unique**, null | Kontoen. `null` for importerede klinikker |
| status | clinic_status not null | Se 3. Ændres kun af admin/service role (trigger `clinics_guard()`) |
| cvr | text null, unique | check `^[0-9]{8}$`. Kan ikke ændres af klinikken |
| name | text not null | |
| description | text null | max 1000 tegn |
| address, postal_code, city | text not null | Offentlige erhvervsoplysninger |
| lat, lng | double precision null | Fra import eller `postal_codes`. Præcis geokodning [ÅBEN] |
| phone, email, website | text null | Offentlig kontakt |
| logo_path | text null | Bucket `public-media` (9.5) |
| trustpilot_url | text null | Skal starte med `https://dk.trustpilot.com/` eller `https://www.trustpilot.com/` |
| trustpilot_score | numeric(2,1) null | 1.0-5.0, manuelt indtastet af klinikken |
| trustpilot_review_count | integer null | Manuelt |
| trustpilot_updated_at | timestamptz null | Sættes af trigger, når score ændres |
| trustpilot_entered_by | text null | `clinic` eller `admin`. For importerede klinikker indtastes Trustpilot-data manuelt af admin/seed (aldrig scraping); bestemmer mærkaten "angivet af klinikken" / "angivet af TandMatch" (8.4) |
| import_source | text null | Fx `cvr`, `seed`. Kun admin/service role |
| verified_at | timestamptz null | Sættes af `admin_set_clinic_status()` |
| updated_at | timestamptz | |

`clinics_guard()` afviser, at ikke-admins ændrer `owner_id`, `status`, `cvr`, `import_source` og `verified_at`, og sætter `trustpilot_entered_by = 'clinic'`, når klinikken selv ændrer Trustpilot-felterne. Trustpilot hentes aldrig automatisk.

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
| consent_text_version | text not null | Den bekræftelsestekst, klinikken accepterede (`lib/constants/consents.ts`, `PORTFOLIO_CONSENT_TEXT_VERSION`) |

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

Redigerbarhed håndhæves i databasen: UPDATE-policyen kræver ejer og `status = 'draft'`, og triggeren `cases_before_update()` afviser ændringer af beskyttede felter (status, AI-felter, tællere, `summary_text`, `submitted_at`) uden for funktionerne i 5.3. En anonym patient kan højst have én `draft` (trigger).

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
| ai_description | text null | Neutral beskrivelse (7.3), godkendes som del af opsummeringen |
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
| requested_starts_at | timestamptz null | Kun akutvejen: den tid, patienten har valgt. Reserveres straks som en `held`-booking og bliver `booked` ved accept (6.1) |
| seen_at | timestamptz null | Første gang klinikken åbner leadet |
| responded_at | timestamptz null | |
| clinic_comment | text null | "Accepter med kommentar", max 500 |
| quoted_price_min, quoted_price_max | integer null | Valgfri præciseret pris ved accept. check `0 <= min <= max` |
| decline_reason | lead_decline_reason null | Påkrævet ved afvisning |
| decline_note | text null | max 200 |
| sent_at | timestamptz not null default now() | |
| withdrawn_at | timestamptz null | Sat af `withdraw_lead()` |

Rækker oprettes **kun** af `send_leads()` og ændres kun af `clinic_decide_lead()`, `withdraw_lead()` og booking-funktionerne (5.3). Maks. 3 **aktive** leads pr. sag (`sent`, `accepted`, `booked`; trigger og funktion); afviste og tilbagetrukne tæller ikke, så patienten kan vælge en ny klinik. Samme klinik kan ikke få sagen igen (`UNIQUE (case_id, clinic_id)`). Leads udløber ikke; et ubesvaret lead kan patienten trække tilbage. Efter tilbagetrækning ser klinikken kun, at leadet er trukket tilbage, ikke sagens indhold (5.7).

#### `messages` (beskedtråd pr. lead)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK leads on delete cascade | Tråden er én patient og én klinik |
| sender_id | uuid FK profiles | |
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
| no_show_at | timestamptz null | Sat af `mark_booking_no_show()` |
| completed_at | timestamptz null | Sat af `complete_due_bookings()` (= `ends_at`) |

Regler i databasen:
- **Ingen dobbeltbooking:** `exclude using gist (clinic_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status in ('held', 'booked', 'completed'))`. En reserveret akuttid kan derfor ikke tages af andre. Én kalender pr. klinik [PROTOTYPE].
- Højst én aktiv booking pr. lead: unik delvis indeks på `lead_id` where `status in ('held', 'booked')`.
- Oprettes kun via `book_slot()` og `send_leads()` (akut, `held`); ændres kun via `clinic_decide_lead()`, `withdraw_lead()`, `cancel_booking()`, `mark_booking_no_show()` og `complete_due_bookings()` (5.3). Tiden skal ligge i et åbningsvindue, uden for blokeringer, mindst `MIN_BOOKING_NOTICE_MIN` frem og højst `BOOKING_HORIZON_DAYS` frem (6.7).
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

Klinikker har ingen SELECT-adgang til `cases`, `case_services`, `case_images`, `bookings`, `patients` eller `ai_*`. De læser kun via `clinic_*`-funktionerne (5.7), som aldrig returnerer `patient_id` og kun returnerer kontaktfelterne, når bookingens status er `booked` eller `completed`.

---

## 5. Row Level Security [IKKE BYGGET]

### 5.1 Grundregler

1. RLS på **alle** tabeller. Ingen policy = ingen adgang.
2. API'et bruger brugerens JWT, så RLS gælder i alle normale flows.
3. Views oprettes med `security_invoker = true`.
4. Hjælpefunktioner, der krydser tabeller, er `security definer`, `stable`, har `set search_path = ''`, **returnerer kun boolean** og tager kun et id. **Undtagelser:** `auth_clinic_id()` returnerer den kaldendes egen kliniks id; `booking_effective_status()` returnerer en status; `patient_user_messages_last_day()` og `participant_messages_last_day()` returnerer et heltal om egne rækker. Læsefunktionerne `clinic_*` (5.7) og `public_*` (5.3) returnerer rækker og er bevidst eneste læsevej; de returnerer kun felterne i deres DTO.
5. Ingen bruger kan opdatere `role`, `is_anonymous`, `clinics.status`, `moderation_status`, statusfelter på sager, leads og bookinger eller kontaktfelter direkte. Det sker via triggers eller navngivne funktioner (5.3).
6. **Anonyme sessioner** er `authenticated`-brugere; ejer-regler virker uændret. `is_permanent_user()` spærrer alt ud over egen kladde: leads, delingssamtykke, booking, beskeder, anmeldelser.
7. **Service role** bruges kun til formålene i 2.3. AI-skrivefunktionerne og `try_consume_anonymous_ai_call()` har `revoke execute ... from public, anon, authenticated` og `grant execute ... to service_role`.
8. **Ingen `auth.uid()` i funktioner, der kun kaldes med service role.** Her er `auth.uid()` tom. Sådanne funktioner tager bruger-id'et som parameter og tjekker selv ejerskab og tilstand (fx `try_consume_anonymous_ai_call(p_user_id)`, `append_assistant_message(p_user_id, …)`).
9. **Låst opsummering.** `cases.summary_text` ændres kun via `approve_summary()`.
10. **Storage uden klientskrivning.** Hverken `authenticated` eller `anon` kan skrive, slette eller læse i `case-images`. Signerede URL'er laves af serveren med service role efter en RLS-beskyttet læsning af stien (9.2). `public-media` er offentlig læsbar; skrivning kun med service role (9.5).
11. **Offentlige klinikdata læses kun via `public_*`-funktioner.** Tabellerne `clinics`, `clinic_prices`, `clinic_opening_hours`, `clinic_dentists` og `portfolio_items` har ingen SELECT-policy for `anon` eller andre end ejeren. Så styrer funktionerne, hvilket niveau (basis eller fuld) hver klinik vises med.

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
is_lead_participant(lead_id)          -> boolean     -- ejer af sagen ELLER ejer af leadets klinik, når leadet ikke er 'withdrawn'
is_lead_thread_open(lead_id)          -> boolean     -- lead.status in ('sent','accepted','booked')
booking_effective_status(booking_id)  -> booking_status  -- 'booked' + ends_at <= now() → 'completed'; 'held' + starts_at <= now() → 'cancelled'
                                                     -- (undtagelse fra 5.1 regel 4: returnerer en status, ikke rækker)
is_lead_active_status(status)         -> boolean     -- status in ('sent','accepted','booked'); bruges af loftet på 3
review_is_for_my_clinic(review_id)    -> boolean
is_allowed_consent_text(type, version) -> boolean
participant_messages_last_day()       -> integer
patient_user_messages_last_day()      -> integer
```

### 5.3 Funktioner (RPC, `security definer`)

| Funktion | Kaldes af | Gør |
|---|---|---|
| `send_leads(case_id, clinic_ids uuid[], requested_service_id default null, requested_starts_at default null, contact_name default null, contact_phone default null)` | patient (permanent) | Tjekker ejer, `is_permanent_user()`, godkendt opsummering, mindst én bekræftet ydelse, `preferred_timeframe` sat (ikke ved akut), aktivt `health_data_sharing`, at alle klinikker er `verified`, at sagen ikke allerede har været sendt til klinikken, og at **aktive** leads + nye ≤ 3. `requested_*` og `contact_*` kun ved én klinik og en akutydelse: så tjekkes tiden som i `book_slot()`, og der oprettes i samme transaktion en `held`-booking med kontaktfelterne (overlap → 409 `SLOT_TAKEN`). Indsætter leads med `distance_km` og listepris-snapshot, sætter sagen `submitted` (første gang), `sharing_consent_id`, `submitted_at`, og lukker AI-samtalen. Returnerer kun antal oprettede leads |
| `clinic_decide_lead(lead_id, decision, comment, quoted_min, quoted_max, decline_reason, decline_note)` | klinik (verificeret ejer af leadets klinik) | Kun fra `sent`. `accept`: sætter `accepted`, kommentar og evt. pris; har leadet en `held`-booking, der stadig er gyldig (starttid ikke passeret), bliver den `booked`, og leadet `booked`. Er akuttiden passeret, afvises accept med 409 `HOLD_EXPIRED` [ÅBEN, 12.3]. `decline`: kræver `decline_reason`; en `held`-booking sættes `cancelled` (`cancelled_by = 'clinic'`), så tiden frigives. Sætter `responded_at` |
| `withdraw_lead(lead_id)` | patient (permanent, ejer af sagen) | Kun fra `sent`. Sætter `withdrawn` og `withdrawn_at`; en `held`-booking sættes `cancelled` (`cancelled_by = 'patient'`). Pladsen i loftet på 3 bliver fri |
| `clinic_mark_lead_seen(lead_id)` | klinik (ejer) | Sætter `seen_at`, hvis tom |
| `book_slot(lead_id, service_id, starts_at, contact_name, contact_phone)` | patient (permanent, ejer af sagen) | Leadet skal være `accepted` uden aktiv booking; ydelsen skal være bekræftet på sagen (eller leadets akutydelse). Beregner varighed og `ends_at`, tjekker åbningsvindue (akutvindue kun for akutydelser), blokeringer, varsel og horisont (6.7). Sætter `contact_email` fra `auth.users`, gemmer telefon på `patients`. Indsætter booking; overlap afvises af udelukkelsen (→ 409 `SLOT_TAKEN`). Sætter leadet `booked` |
| `cancel_booking(booking_id)` | patient (ejer) eller klinik (ejer) | Kun `booked` og før `starts_at`. Sætter `cancelled`, `cancelled_by`, `cancelled_at`; leadet tilbage til `accepted` |
| `mark_booking_no_show(booking_id)` | klinik (ejer) | Kun effektiv status `booked` og `starts_at <= now() < ends_at`. Sætter `no_show`, `no_show_at`. Efter sluttid er bookingen gennemført og kan ikke ændres [ÅBEN om frist, 12.3] |
| `complete_due_bookings()` | **kun service role** (planlagt job, `/api/cron/complete-bookings`, hver time) | Sætter `completed`, `completed_at = ends_at` for `booked` med `ends_at <= now()`, og `cancelled` for `held` med `starts_at <= now()`. Ren oprydning; reglerne bygger på `booking_effective_status()`. Bruger ikke `auth.uid()` |
| `withdraw_consent(consent_id)`, `confirm_consent_cleanup(consent_id)` | patient (+anonym) | Som før, men billeder hænger på sager. Tilbagetrækning af `image_upload` sletter rækkerne i `case_images` (også på sendte sager), og billederne forsvinder dermed for klinikkerne |
| `approve_summary(case_id, summary_text)` | patient (+anonym, ejer) | Eneste vej til `summary_text`. Kun `draft`, max 1500 |
| `store_ai_summary(p_user_id, case_id, …)` | **kun service role** | Skriver det validerede udkast. Tjekker internt, at sagen tilhører `p_user_id` og er `draft` |
| `append_assistant_message(p_user_id, conversation_id, …)` | **kun service role** | Indsætter assistentbesked (svar, foreløbig vurdering, foreslåede ydelser, akut, out-of-scope, blocked). Tjekker ejer og `active`. Afviser ydelses-id'er, der ikke er aktive i kataloget |
| `consume_summary_generation(case_id)` | patient (+anonym, ejer) | Én transaktion: `draft`, sagens loft (5), patientens døgnloft (20), for anonyme det globale loft. Øger tællerne |
| `try_consume_anonymous_ai_call(p_user_id)` | **kun service role** | Atomisk: tjekker at `p_user_id` er anonym, øger dagens tæller og returnerer `true` under loftet `ai_limits.anon_daily_ai_calls` (300). Bruger **ikke** `auth.uid()` (5.1 regel 8) |
| `consume_rate_limit(key, limit)` | **kun service role** | Uændret. IP kun som hash |
| `touch_last_active()` | `authenticated` | Uændret |
| `moderate(kind, id, status, reason)` | admin | **[IKKE BYGGET]** (heller ikke planlagt i demoen). Seed-anmeldelser er forhåndsgodkendte |
| `admin_set_clinic_status(clinic_id, status)` | **kun service role** (seed og admin-scripts) [PROTOTYPE] | Sætter `status` og `verified_at` via et transaktionsflag, som `clinics_guard()` kun accepterer fra denne funktion |
| `clinic_leads()`, `clinic_lead_detail(lead_id)`, `clinic_lead_images(lead_id)`, `clinic_bookings(from, to)`, `clinic_reviews()` | klinik | Læsefunktioner (5.7) |
| `public_clinics(p_service_ids uuid[], p_clinic_ids uuid[])` | alle, også `anon` | Basisdata (inkl. Trustpilot) for `imported`, `registered` og `verified` klinikker + fulde felter (status, logo, priser for de angivne ydelser, `has_emergency_hours`) kun for `verified`. Ingen `owner_id`, ingen `cvr` |
| `public_clinic_profile(clinic_id)` | alle | Som ovenfor for én klinik, plus beskrivelse, hele prislisten, åbningstider, tandlæger og portefølje (kun `verified`) |
| `public_busy_intervals(clinic_ids uuid[], from, to)` | alle | Optagede tidsrum (`held`- og `booked`-bookinger samt blokeringer) for verificerede klinikker. Kun `starts_at`/`ends_at`, ingen id'er, ingen typer. Grundlag for ledige tider (6.7) |
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
| consent_text_versions, postal_codes, services | offentlig (`services`: kun `is_active` for ikke-admins) | ingen | ingen | ingen |
| ai_limits, ai_usage_daily, ai_patient_usage_daily, rate_limits | ingen | ingen | ingen | ingen |
| clinics | `is_clinic_owner(id)` eller `is_admin()`. Offentligt via `public_*` | kun signup-trigger | `is_clinic_owner(id)` (trigger `clinics_guard()` låser status, ejer, CVR m.m.) | ingen |
| clinic_prices, clinic_opening_hours, clinic_time_blocks, clinic_dentists | `is_clinic_owner(clinic_id)`. Offentligt via `public_*` (blokeringer kun som optagede tidsrum) | `is_clinic_owner(clinic_id)` og `is_permanent_user()` | som insert | som insert |
| portfolio_items | `is_clinic_owner(clinic_id)`. Offentligt via `public_clinic_profile()` | **ingen** for `authenticated`; kun service role efter upload (9.5) | `is_clinic_owner(clinic_id)` (kun `caption`, `service_id`) | ingen for `authenticated`; slettes af serveren med service role (filen skal også slettes) |
| cases | `patient_id = uid` | `patient_id = uid` og `status = 'draft'` (trigger: anonym max 1) | `patient_id = uid` og `status = 'draft'` (trigger låser beskyttede felter) | `patient_id = uid` og `status = 'draft'` |
| case_services | `is_case_owner(case_id)` | `is_case_owner(case_id)` og sagen er `draft` og ydelsen aktiv | ingen | `is_case_owner(case_id)` og sagen er `draft` |
| ai_conversations | `patient_id = uid` | `patient_id = uid` og `is_case_owner(case_id)` og `draft` og `has_active_consent('ai_processing')` | ingen | cascade |
| ai_messages | `patient_id = uid` | `patient_id = uid`, samtalen er egen og `active`, `role = 'user'` | ingen | cascade |
| case_images | `patient_id = uid`. Klinikker via `clinic_lead_images()` | ingen for `authenticated` (service role) | ingen | ingen for `authenticated` (service role) |
| leads | `is_case_owner(case_id)` eller `is_clinic_owner(clinic_id)` | **ingen** (kun `send_leads`) | **ingen** (kun funktionerne i 5.3) | ingen |
| messages | `is_lead_participant(lead_id)` | `sender_id = uid` og `is_permanent_user()` og `is_lead_participant(lead_id)` og `is_lead_thread_open(lead_id)` | modtager må sætte `read_at` | ingen |
| bookings | `patient_id = uid`. Klinikker **ingen** direkte; kun via `clinic_bookings()`/`clinic_lead_detail()` | ingen (kun `book_slot`) | ingen (kun `cancel_booking`, `complete_booking`) | ingen |
| reviews | `patient_id = uid` eller `is_admin()`. Offentligt via `public_reviews()`, klinikken via `clinic_reviews()` | se 8.1 | ingen | ingen ([IKKE BYGGET]) |
| review_replies | `clinic_id = auth_clinic_id()` eller `is_admin()`. Offentligt via `public_reviews()` | `review_is_for_my_clinic(review_id)` og anmeldelsen er godkendt og `clinic_id = auth_clinic_id()` | ingen | ingen |

Note: `leads` SELECT for klinikker giver adgang til hele rækken, men rækken indeholder ingen patientidentitet (kun `case_id`, som klinikken ikke kan slå op i `cases`). API'et læser klinikkens leads via `clinic_*`-funktionerne.

### 5.5 Isolation og skjulte kontaktoplysninger

- `leads` SELECT har præcis to veje ind: *du ejer sagen* eller *du ejer leadets klinik*. At have et lead på samme sag giver **ikke** adgang til andre leads på sagen.
- `messages` arver dette via `is_lead_participant`.
- Ingen funktion, view eller route returnerer noget om andre leads på en sag til en klinik (fx antal, status, priser). `send_leads` returnerer kun antal til patienten.
- **Kontaktoplysninger** ligger kun i `bookings.contact_*` (og `patients.phone`, som kun patienten selv kan læse). Klinikken har ingen SELECT på `bookings` eller `patients`. `clinic_bookings()` og `clinic_lead_detail()` returnerer `contact_*` kun, når bookingen tilhører klinikken og har effektiv status `booked` eller `completed`. En reserveret akuttid (`held`) viser ingen kontakt, før klinikken har accepteret. Det er dermed databasen, ikke UI, der skjuler navn og kontakt.
- `patient_id` når aldrig klinikken: ikke i funktioner, ikke i storage-stier, ikke i DTO'er.
- AI-chatten er kun synlig for patienten.

### 5.6 Obligatoriske RLS-tests (security/tester)

SQL-scripts i `tests/rls/`, kørt mod lokal Supabase efter `supabase db reset`. De skifter rolle og JWT-claims for testbrugere:
1. Klinik X og Y har begge et lead på sag S. X kan ikke læse Y's lead, beslutning, beskeder eller bookinger (direkte tabel og via funktioner).
2. Klinik Z uden lead på S kan ikke læse S, S's ydelser, billeder (tabel, `clinic_lead_images()`) eller leads.
3. Patient A kan ikke læse patient B's sager, ydelser, AI-samtaler, billeder, samtykker, leads, bookinger, beskeder eller anmeldelser.
4. Ingen klinik kan læse `ai_conversations`, `ai_messages`, `cases`, `case_images`, `bookings` eller `patients` direkte.
5. Klinikken får `contact_*` = `null` fra `clinic_lead_detail()`/`clinic_bookings()` for et lead uden booking, en `held`-akuttid, et lead med aflyst booking og et lead med `no_show`; og udfyldt for `booked` og (effektivt) `completed`. `patient_id` returneres aldrig.
6. `send_leads` afviser: anonym bruger, et fjerde **aktivt** lead, samme klinik to gange, ikke-verificeret klinik, manglende opsummering, ingen bekræftede ydelser, manglende `health_data_sharing`. Efter én afvisning eller tilbagetrækning kan et nyt lead sendes til en anden klinik.
7. `book_slot` afviser: lead der ikke er `accepted`, en andens lead, overlappende tid inkl. en `held`-akuttid (samtidige kald: kun ét lykkes), tid uden for åbningstid, almindelig ydelse i akutvindue, tid i blokering.
8. `clinic_decide_lead` afviser andre end ejeren af leadets klinik og en ikke-verificeret klinik; et `declined` eller `withdrawn` lead kan ikke accepteres. Accept af et akut-lead gør `held` til `booked`; afvisning frigiver tiden, så en anden kan booke den.
9. Anmeldelse afvises før sluttid, ved `no_show`, ved `cancelled` og ved anden anmeldelse af samme booking; den tillades efter sluttid, selv om `complete_due_bookings()` ikke har kørt. `mark_booking_no_show` afvises før starttid og efter sluttid.
10. Besøgende uden session kan kun læse offentlige tabeller og `public_*`-funktioner; `public_*` returnerer ingen priser, tandlæger eller portefølje for `imported`/`registered` klinikker og aldrig `owner_id` eller `cvr`.
11. Klinik kan ikke ændre egen `status`, `owner_id` eller `cvr`, og kan ikke redigere en anden kliniks prisliste, åbningstider, tandlæger eller portefølje.
12. Anonym session kan ikke: kalde `send_leads`, give `health_data_sharing`, oprette en anden kladde, skrive beskeder eller anmeldelser, booke.
13. Efter kontooprettelse har brugeren samme id og ser fortsat sin kladde, chat, billeder og samtykker; en anden bruger med `case_id` får intet.
14. Patient kan ikke ændre `status`/`user_message_count` på `ai_conversations`, ikke indsætte `ai_messages` med `role = 'assistant'`, ikke ændre `summary_text` direkte, ikke kalde `append_assistant_message()`, `store_ai_summary()` eller `try_consume_anonymous_ai_call()`.
15. `try_consume_anonymous_ai_call(p_user_id)` kaldt med service role returnerer `true` for en anonym bruger under loftet, `false` over loftet og `false` for en permanent bruger.
16. Billeder: upload og insert efter afsendelse afvises; uden aktivt `image_upload` afvises; efter tilbagetrækning returnerer `clinic_lead_images()` intet.
17. `terms_acceptances`: A kan ikke læse eller ændre B's, ingen kan ændre egne.
18. Beskeder kan sendes af begge parter på et lead med status `sent`, men ikke på `declined` eller `withdrawn`. Efter `withdrawn` kan klinikken hverken læse sagens indhold, billeder eller beskeder.
19. `withdraw_lead` afvises for andre end sagens ejer og for leads, der ikke er `sent`; en `held`-akuttid frigives.
20. `public_reviews()` og `public_clinic_review_stats_many()` returnerer intet for `imported`/`registered` klinikker.

API-tests (obligatoriske): vilkårs-gaten (403 `TERMS_REQUIRED`, forfalsket cookie afvises, ny version kræver ny accept) og "vilkårs-accept giver ikke samtykke" (403 `CONSENT_REQUIRED` ved upload/chat).

### 5.7 Klinikkens læsevisninger

Alle kræver, at den kaldende ejer klinikken. Leads og bookinger kræver desuden `verified`.

For leads med status `withdrawn` returnerer alle funktionerne kun id, status, `sent_at` og `withdrawn_at`; intet sagsindhold, ingen billeder.

- `clinic_leads()`: egne leads med status, ydelsesnavne, område, afstand, ønsket tidsrum, akutmarkering, ønsket akuttid, antal billeder, `sent_at`, `seen_at`, ulæste beskeder. Ingen `patient_id`, ingen `case_id`.
- `clinic_lead_detail(lead_id)`: sagens godkendte indhold (ydelser, `summary_text`, `summary_ai_assisted`, ønsket tidsrum, område, akut), listepris-snapshot, egen beslutning og den aktive eller seneste booking med `contact_*` efter reglen i 5.5.
- `clinic_lead_images(lead_id)`: billedstier og godkendte beskrivelser, kun med aktivt `image_upload`-samtykke. Serveren signerer stierne (9.2).
- `clinic_bookings(from, to)`: kalenderen: egne bookinger med ydelse, tider, status, `lead_id` og `contact_*` efter reglen i 5.5.
- `clinic_reviews()`: godkendte anmeldelser af egen klinik + eget svar og dets status.

---

## 6. Sider og routes (App Router) [IKKE BYGGET]

Slugs er danske uden æøå. Alle sider er mobile-first og tjekkes ved 390 px og 1280 px. Design: hvid og blå, farverne i Tailwind-temaet.

### 6.1 Offentlige sider

| Route | Indhold |
|---|---|
| `/` | Forside: kort forklaring, to indgange ("Beskriv dit problem" → `/start`, "Find en klinik" → `/klinikker`) og en tydelig "Jeg har ondt" → `/akut` |
| `/start` | Start på chatten uden login: særskilt AI-samtykke (ikke billedsamtykke). Opretter anonym session og tom sag og sender til `/start/[caseId]`. Patienter med konto opretter sagen via `POST /api/cases`. Har sessionen allerede en kladde, fortsættes den |
| `/start/[caseId]` | **Sagsflowet** for anonyme og patienter med konto, der ejer sagen. Server-vagt `guardCaseFlow()` (patient, anonym tilladt; ejerskab tjekkes af API'et). Trin: 1 chat med billeder (billedsamtykke lige før første upload), 2 bekræft ydelser (AI-forslag, "Jeg er ikke sikker" → Undersøgelse), 3 opsummering (ret og godkend), postnummer og ønsket tidsrum, 4 "Find klinikker" → `/klinikker?sag=[caseId]`. Anonyme ser `AnonymousPatientBanner` (48 timer, opret konto, slet) |
| `/start/[caseId]/send` | Afsendelse til de valgte klinikker (op til 3, sendt med som `?klinikker=`): opret konto hvis anonym (inline, 7.7), samtykke til deling, oversigt over valgte klinikker med listepris, send. Redirect til `/patient/sag/[caseId]` |
| `/klinikker` | Klinikoversigt: liste + kort (Leaflet, OpenStreetMap) + filtre (ydelse, afstand/postnummer, maks. pris, min. bedømmelse, kun med ledig akuttid, kun klinikker, der kan kontaktes) og sortering (6.6). Med `?sag=` er sagens bekræftede ydelser og postnummer forvalgt, og patienten kan markere op til 3 klinikker til sammenligning og afsendelse. Kortet viser de samme klinikker som listen |
| `/klinikker/[clinicId]` | Klinikprofil: grunddata, åbningstider, kort, Trustpilot, anmeldelser og prisnøjagtighed. Verificerede også: beskrivelse, prisliste, første ledige tid, tandlæger med portefølje og "Vælg klinik" (med sag) |
| `/akut` | Akutvejen: vælg akutydelse (forvalgt hvis kun én), klinikker sorteret efter første ledige akuttid. Patienten vælger klinik og tid, **logger ind eller opretter konto** (kræves), skriver kort hvad der er galt, angiver navn og telefon, giver delingssamtykke og sender. Opretter en sag med `is_emergency = true` og ét lead; tiden **reserveres straks** (`held`), så andre ikke kan tage den. Accepterer klinikken, bliver reservationen en booking; afviser den, eller trækker patienten leadet tilbage, frigives tiden, og patienten kan vælge en anden klinik. Ingen AI i akutvejen |
| `/login`, `/opret`, `/opret/patient`, `/opret/klinik` | Login og signup. `/opret/klinik` beder om CVR, klinikkens navn, adresse, postnummer, by, telefon |
| `/saadan-virker-det`, `/saadan-tjener-vi-penge`, `/for-klinikker`, `/om-os`, `/kontakt` | Informationssider (statisk indhold, ingen API). Indgangen til chatten er synlig i headeren på alle offentlige sider og patientsider |
| `/vilkaar/accepter`, `/vilkaar`, `/privatliv` | Vilkårs-gaten og tekster (2.5). Bygget |

### 6.2 Patientflade (`/patient`, rolle `patient`, permanent konto)

| Route | Indhold |
|---|---|
| `/patient` | Mine sager med status, leads (status pr. klinik) og kommende bookinger |
| `/patient/sag/[caseId]` | Sagen: hvert lead med klinik, status, klinikkens kommentar, præciseret pris og listepris, "Træk tilbage" ved ubesvaret lead, "Book tid" ved accepteret lead, beskedtråd pr. lead (åben fra afsendelse), "Kontakt flere klinikker" (hvis færre end 3 aktive leads) og "Luk sag" |
| `/patient/sag/[caseId]/book/[leadId]` | Vælg ydelse (blandt sagens bekræftede), vælg ledig tid, indtast fulde navn og telefon (forudfyldt), book |
| `/patient/bookinger` | Kommende og tidligere bookinger; aflys før starttid |
| `/patient/anmeldelser`, `/patient/anmeld/[bookingId]` | Gennemførte bookinger, der kan anmeldes, mine anmeldelser; anmeldelsesformular |
| `/patient/samtykker` | Samtykker, tilbagetrækning, dataeksport |
| `/patient/konto` | Profil (navn, postnummer, telefon), slet konto |

### 6.3 Klinikflade (`/klinik`, rolle `clinic`)

En `registered` klinik ser et banner "Afventer verifikation" og kan sætte alt op, men indbakke og kalender er tomme, indtil den er verificeret.

| Route | Indhold |
|---|---|
| `/klinik` | Lead-indbakke: nye leads øverst (akut først), status, ydelser, område, ønsket tidsrum |
| `/klinik/lead/[leadId]` | **Lead-kortet**, bygget til under et minut: ydelser, opsummering, billeder, tidsrum, område, listepris. Knapper: Accepter / Accepter med kommentar (+ evt. præciseret pris) / Afvis (hurtige begrundelser). Beskedtråden er åben fra start, så klinikken kan stille et afklarende spørgsmål før beslutning. Efter booking vises navn, telefon og e-mail. Åbning sætter `seen_at`. Tilbagetrukne leads vises kun som "Trukket tilbage af patienten" |
| `/klinik/kalender` | Bookinger og reserverede akuttider pr. dag/uge, marker udeblevet (kun mens tiden står på), aflys; blokeringer. Besøg bliver automatisk gennemført efter sluttid |
| `/klinik/profil` | Grunddata, beskrivelse, logo, kontakt, Trustpilot |
| `/klinik/prisliste` | Prisliste pr. ydelse i kataloget: interval, varighed, note |
| `/klinik/aabningstider` | Ugeskema og akutvinduer |
| `/klinik/tandlaeger` | Tandlæger og deres portefølje (upload med bekræftelse af patientens samtykke) |
| `/klinik/anmeldelser` | Godkendte anmeldelser + offentligt svar |

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

Rangeringen ligger i `RankingService` (`services/rankingService.ts`, ingen I/O, enhedstestet) og bruges af `ClinicDirectoryController`. Den er **ikke** AI-baseret, og kriterierne vises for patienten.

**Visningsniveau pr. klinik** (bestemmes af `public_*`-funktionerne ud fra `clinics.status`):

| Niveau | Status | Felter |
|---|---|---|
| Basis | `imported`, `registered` [PROTOTYPE for `registered`] | Navn, adresse, kortplacering, kontakt (telefon, web), åbningstider og Trustpilot (hvis kendt). **Ingen egne anmeldelser og ingen prisnøjagtighed.** Kan ikke vælges til leads |
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
- **Filtre:** ydelser (slugs, flere), maks. afstand (standard 25 km), maks. pris, min. stjerner, kun med akuttid inden for 48 timer, kun klinikker der kan kontaktes (`verified`).
- MVP: alle klinikker hentes og sorteres i API'et (få klinikker). Sidevisning [UDSKUDT].
- Kortet (`views/components/clinic-directory/clinic-map.tsx`) er en klientkomponent, der indlæses dynamisk uden SSR (Leaflet kræver `window`), og viser præcis listens resultat. Markører for niveau "fuld" og "basis" ser tydeligt forskellige ud. Desktop: liste og kort side om side; mobil: skift mellem dem. Fliser fra OpenStreetMap med altid synlig kreditering "© OpenStreetMap-bidragydere" [PROTOTYPE]. CSP skal tillade fliseserveren.

**Usikker patient:** AI'en spørger først ind (7.3). Er patienten stadig usikker, foreslås ydelsen Undersøgelse, og patienten sendes til oversigten med justerbare kriterier.

### 6.7 Ledige tider

Beregnes i `AvailabilityService` (`services/availabilityService.ts`, ingen I/O, enhedstestet) ud fra data fra `AvailabilityRepository` (`public_clinics`/`public_clinic_profile` for åbningstider og priser, `public_busy_intervals()` for optaget tid). `book_slot()` gentager tjekket i databasen, så beregningen ikke er en sikkerhedsgrænse.

- **Input:** åbningsvinduer (lokal tid `Europe/Copenhagen`, inkl. `is_emergency`), optagede tidsrum, ydelsens varighed (klinikkens `duration_min`, ellers katalogets `default_duration_min`), om ydelsen er akut, tidsinterval.
- **Slots:** starttider på hele `SLOT_STEP_MIN` (15 min) inden for et vindue, hvor `start + varighed` ligger helt i vinduet og ikke overlapper optaget tid. Almindelige ydelser kun i almindelige vinduer; akutydelser i begge.
- **Grænser:** tidligst `now + MIN_BOOKING_NOTICE_MIN` (30 min, akut 0 min), senest `BOOKING_HORIZON_DAYS` (60 dage). "Første ledige tid" i oversigten søges inden for `FIRST_AVAILABLE_SEARCH_DAYS` (14 dage); ellers "Ingen ledige tider de næste 14 dage".
- Værdierne står i `lib/constants/bookings.ts` og er MVP-værdier.
- Kun verificerede klinikker har ledige tider.

---

## 7. AI-flowet [IKKE BYGGET]

OpenAI-klienten, PII-maskering, fejlhåndtering og skrivevejen via service role findes og genbruges (`services/ai/openai.ts`, `pii.ts`, `errors.ts`). Prompts, skemaer, regler og guard skrives om.

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
| Katalog | Aktive ydelser som `slug`, navn, kategori, kort beskrivelse (`catalogContext.ts`). **Ingen priser, ingen klinikker** | Samme |
| Kontekst | Seneste 20 beskeder; sagens billeder (low detail) | Hele chatten (max 30 brugerbeskeder), bekræftede ydelser, billeder |
| Billeder | Re-encodet server-side (EXIF fjernet), max 1024 px, base64. Aldrig signerede URL'er | Samme |
| Output | `AiChatTurn` (7.4) | `AiSummary` (7.4) |

**Aldrig** til OpenAI: navn, e-mail, telefon, postnummer, adresse, `patient_id`, klinikdata eller priser. Patienttekst PII-maskeres før afsendelse og gemmes maskeret. Patienttekst sendes som data adskilt fra instruktioner (`<patient_input>…</patient_input>`). AI'en har ingen værktøjer eller handlinger.

**Skrivevej:** `ChatController` kalder `AiChatService.sendTurn()` og skriver det validerede svar via `append_assistant_message(p_user_id, …)`; summary-routen kalder `consume_summary_generation()` før OpenAI og skriver via `store_ai_summary(p_user_id, …)`. Begge kræver service role. For anonyme kaldes `try_consume_anonymous_ai_call(session.userId)` før hvert AI-kald.

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
// lib/types/ai.ts
export type OutOfScopeTopic = "price" | "clinic_recommendation";

export type AiChatTurn = {
  reply: string;                        // max 700. Spørgsmål, forklaring, procesvejledning
  preliminaryAssessment: string | null; // max 400. Altid foreløbig; null hvis rules.ts slår vurdering fra
  suggestedServices: string[];          // max 5 slugs fra kataloget; ukendte fjernes af serveren
  emergency: boolean;                   // akutte tegn
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean;             // aktiverer kun en knap
};

export type AiSummary = {
  summaryText: string;                  // max 800. Til klinikken: patientens ønske og oplysninger, neutralt
  patientWishes: string[];              // max 5
  patientReportedHistory: string[];     // max 5
  suggestedServices: string[];          // max 5 slugs
  images: AiImageObservation[];
  outOfScopeTopics: OutOfScopeTopic[];
};

export type AiImageObservation = {
  imageRef: string;                     // "img_1" …, mappes til case_images.id på serveren
  view: "front" | "upper" | "lower" | "side_left" | "side_right" | "unclear";
  visibleArea: string;                  // max 80
  observations: string[];               // max 4, hver max 120; kun synlige forhold uden fortolkning
  quality: "ok" | "too_dark" | "blurry" | "wrong_angle" | "not_teeth";
};
```

### 7.5 Guardrails, lag for lag

| # | Hvor | Chat | Opsummering |
|---|---|---|---|
| 1 | UI | Fast tekst over chatten: "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer." Fast mærkat ved foreløbig vurdering. Fast akut-blok ved `emergency` | Mærkat "Beskrivelse, ikke vurdering" ved billedbeskrivelser |
| 2 | System-prompt | Reglerne fra `rules.ts` (7.3), kataloget | Samme |
| 3 | Input | Data-afgrænsning, PII-maskering, max 1000 tegn | Samme |
| 4 | Output-skema | `AiChatTurn` strict | `AiSummary` strict |
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
| Chatbeskeder pr. patient pr. døgn | 100 | 429 |
| Opsummeringer pr. sag / pr. patient pr. døgn | 5 / 20 | 429 `SUMMARY_LIMIT` |
| Billeder pr. sag | 5, max 4 MB hver | 400/413 |
| Bekræftede ydelser pr. sag | 5 | 400 |
| Aktive leads pr. sag (`sent`, `accepted`, `booked`) | 3 | 409 `LEAD_LIMIT` |
| Timeout pr. OpenAI-kald | 30 s | 503 |
| Kontekst til chat | seneste 20 beskeder | |
| Anonym: kladder / beskeder / opsummeringer / billeder / lagring | 1 / 30 / 3 / 5 / 20 MB | 409 / 429 / 429 / 400 / 413 |
| Anonym levetid | 48 timer efter seneste aktivitet | Slettes (7.7) |
| Nye anonyme sessioner, login, signup, billedupload pr. IP | 10 pr. time (`consume_rate_limit`) | 429 |
| AI-kald fra alle anonyme pr. døgn | `ai_limits.anon_daily_ai_calls` (300) | 429 `ANON_CAP_REACHED` |
| Beskeder i tråden | 2000 tegn, 200 pr. afsender pr. døgn | 400 / 429 |
| Bookinger | 1 aktiv pr. lead | 409 |

Lofterne tælles i databasen (triggers og funktionerne i 5.3). Konstanterne står i `lib/constants/limits.ts`.

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

## 8. Anmeldelser og prisnøjagtighed [IKKE BYGGET]

### 8.1 Verifikation: kun efter gennemført booking

En patient kan anmelde klinik K, hvis og kun hvis K er verificeret, og der findes en booking med `patient_id = uid`, `clinic_id = K` og effektiv status `completed`, som ikke allerede er anmeldt (`unique(booking_id)`).

RLS INSERT-policy på `reviews`:
```
patient_id = uid and is_permanent_user()
and exists (select 1 from bookings b
            where b.id = reviews.booking_id and b.patient_id = uid
              and public.booking_effective_status(b.id) = 'completed')
```
Trigger sætter `clinic_id` fra bookingen og tvinger `moderation_status = 'pending'`. Et besøg er gennemført automatisk efter sluttid, medmindre klinikken har markeret det som udeblevet, mens tiden stod på (4.2). Klinikken skal altså ikke gøre noget, for at et besøg tæller.

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

---

## 9. Billeder og storage

### 9.1 Buckets [IKKE BYGGET]

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

### 9.5 `public-media`: logo, tandlæger og portefølje [IKKE BYGGET]

Stier: `clinics/{clinic_id}/logo.jpg`, `clinics/{clinic_id}/dentists/{dentist_id}.jpg`, `clinics/{clinic_id}/portfolio/{item_id}.jpg`.

- Offentlig læsning. Ingen skriverettigheder for `authenticated` eller `anon`; serveren skriver og sletter med service role (`PublicMediaStorage`) efter ejertjek (`ClinicsRepository.requireOwn()`).
- Samme behandling som patientbilleder: størrelsestjek, magic bytes, re-encoding, EXIF fjernes.
- **Portefølje:** upload kræver, at klinikken afkrydser en bekræftelse af, at patienten på billedet har givet skriftligt samtykke til offentliggørelse, og at billedet ikke viser ansigt eller andet identificerende [ÅBEN, 12.3]. Serveren gemmer `patient_consent_confirmed_at` og `consent_text_version` på `portfolio_items`. Klinikken er dataansvarlig for samtykket. Sletning fjerner rækken og filen.
- Vises kun for verificerede klinikker (via `public_clinic_profile()`); filerne er dog offentlige, når de er uploadet.

---

## 10. API-kontrakter [IKKE BYGGET]

Typer i `lib/types/<domæne>.ts`, zod-skemaer i `lib/schemas/<domæne>.ts`. "Rolle" angiver hvem routen er for; alle andre får 403/404. Undtaget fra [IKKE BYGGET] er routes markeret "Bygget" (de findes og tilpasses kun).

### 10.1 Delte typer

```ts
// lib/types/common.ts
export type Role = "patient" | "clinic" | "admin";
export type PriceRange = { min: number; max: number };  // hele kroner
export type ImageDto = { id: string; url: string; view: string | null; quality: string | null };
export type TrustpilotInfo = { url: string; score: number | null; reviewCount: number | null; updatedAt: string | null; enteredBy: "clinic" | "admin" } | null;

// lib/types/services.ts
export type ServiceCategory = "cosmetic" | "general" | "emergency";
export type ServiceDto = { id: string; slug: string; name: string; description: string; category: ServiceCategory; defaultDurationMin: number };

// lib/types/reviews.ts
export type PriceAccuracy = "as_quoted" | "slightly_higher" | "much_higher";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type ReviewStats = {
  reviewCount: number; avgStars: number | null; priceAccuracyPct: number | null;
  distribution: { asQuoted: number; slightlyHigher: number; muchHigher: number } | null;
};

// lib/types/consents.ts
export type ConsentType = "health_data_sharing" | "image_upload" | "ai_processing";
```

### 10.2 Auth, anonym session og konto

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/terms/status`, POST `/api/terms/accept` | alle (undtaget fra gaten) | uændret | Bygget |
| POST `/api/session/anonymous` | besøgende, gyldig vilkårs-accept | `{ aiConsent: { textVersion } }` (strict) | 201 `{ caseId, expiresAt }`. Opretter anonym session, vilkårs-accept, `ai_processing`-samtykke og tom sag. Retry-sikker. 409 `ALREADY_AUTHENTICATED` ved permanent konto; 429 ved IP-limit |
| POST `/api/auth/convert` | anonym patient | `{ email, password, firstName }` | 200 `{ userId, role: "patient" }`; 409 `EMAIL_EXISTS` |
| POST `/api/auth/signup` | besøgende | Diskrimineret på `role`: patient `{ role: "patient", email, password (8-72), firstName (1-50) }`; klinik `{ role: "clinic", email, password, cvr (8 cifre), clinicName (2-100), address, postalCode, city, phone }` | 201 `{ userId, role }`. Signup-triggeren opretter `profiles` + `patients` eller `profiles` + `clinics` (status `registered`). Findes en **importeret** klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE]; har den en ejer: 409 `CLINIC_EXISTS`. 409 ved aktiv anonym session |
| POST `/api/auth/login`, POST `/api/auth/logout` | | uændret | Bygget |
| GET `/api/me` | med session | | `{ id, role, isAnonymous, displayName, anonymousExpiresAt, clinic?: { id, name, status } }` |
| GET/PATCH `/api/patients/me` | patient | PATCH `{ firstName?, postalCode?, phone? }` | `{ firstName, postalCode, phone }` |
| DELETE `/api/patients/me` | patient eller anonym | `{ confirm: "SLET" }` | 204 |
| GET `/api/patients/me/export` | patient eller anonym | | `{ exportedAt, cases, leads, bookings, reviews, consents }` (GDPR art. 20) |
| GET/POST `/api/cron/cleanup-anonymous` | intern (`CRON_SECRET`) | | 200 `{ deletedSessions }`. Bygget; tilpasses til `{case_id}/`-mapper |

IP-rate-limited: login, signup, anonym session, billedupload. Routes, som anonyme må kalde, kalder `touch_last_active()`.

### 10.3 Samtykker

Bygget; uændret: GET `/api/consents`, POST `/api/consents` (`{ type, textVersion }`; `health_data_sharing` kun permanent), POST `/api/consents/{id}/withdraw` (`{ withdrawnAt, deletedImages, sessionDeleted }`).

### 10.4 Ydelseskatalog

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/services` | alle | `?category=` | `{ services: ServiceDto[] }` (kun aktive, sorteret) |

### 10.5 Sager (patient)

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
| GET `/api/cases` | patient | | `{ cases: CaseListItemDto[] }` |
| POST `/api/cases` | kun patient med konto | `{}` | 201 `CaseDto` |
| GET `/api/cases/{id}` | patient (+anonym), ejer | | `CaseDto` |
| PATCH `/api/cases/{id}` | patient (+anonym), `draft` | `{ postalCode?, preferredTimeframe? }` | `CaseDto` |
| DELETE `/api/cases/{id}` | patient (+anonym), `draft` | | 204 (sletter også billedfiler) |
| PUT `/api/cases/{id}/services` | patient (+anonym), `draft` | `{ services: { serviceId, suggestedByAi }[] }` (1-5) | `CaseDto` |
| POST `/api/cases/{id}/images` | patient (+anonym), `draft`, aktivt `image_upload` | multipart `file` | 201 `ImageDto` |
| DELETE `/api/cases/{id}/images/{imageId}` | patient (+anonym), `draft` | | 204 |
| POST `/api/cases/{id}/summary` | patient (+anonym), `draft`, aktivt `ai_processing` | `{}` | `SummaryResponse` |
| PUT `/api/cases/{id}/summary` | patient (+anonym), `draft` | `{ summaryText }` (max 1500) | `{ summaryText, summaryApprovedAt }` |
| POST `/api/cases/{id}/leads` | patient med konto, aktivt `health_data_sharing` | `{ clinicIds: string[] }` (1-3; samlet ≤ 3 med de **aktive** leads) | 201 `{ leads: PatientLeadDto[] }`; 403 `ACCOUNT_REQUIRED`; 409 `LEAD_LIMIT`, `CLINIC_ALREADY_CONTACTED`, `CLINIC_NOT_AVAILABLE`, `CASE_NOT_READY` |
| POST `/api/leads/{id}/withdraw` | patient, ejer af sagen, lead `sent` | `{}` | `PatientLeadDto` (status `withdrawn`); 409 hvis leadet er besvaret |
| GET `/api/cases/{id}/leads` | patient, ejer | | `{ leads: PatientLeadDto[] }` |
| POST `/api/cases/{id}/close` | patient, ejer | | `{ status: "closed" }` |

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

```ts
// lib/types/clinics.ts
export type ClinicStatus = "imported" | "registered" | "verified";
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
  firstAvailableAt: string | null;
  firstEmergencyAt: string | null;
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
| GET `/api/clinics` | alle | `?services=slug,slug&postalCode=&lat=&lng=&maxDistanceKm=&maxPrice=&minStars=&emergency=true&contactableOnly=true&sort=price\|rating\|price_accuracy\|distance\|first_available` | `{ clinics: ClinicListItemDto[], sort, criteria: string[] }`. Sorteret af `RankingService` (6.6). `lat/lng` gemmes ikke |
| GET `/api/clinics/{id}` | alle | `?services=` | `ClinicProfileDto` |
| GET `/api/clinics/{id}/availability` | alle | `?serviceId=&from=&to=` (max 14 dage pr. kald) | `{ slots: SlotDto[] }`. Kun verificerede; 404 ellers (6.7) |
| GET `/api/clinics/{id}/reviews` | alle | | `{ stats: ReviewStats, reviews: PublicReviewDto[] }`. 404 for ikke-verificerede klinikker |

### 10.8 Egen klinik (rolle `clinic`)

| Metode og route | Input | Output |
|---|---|---|
| GET/PATCH `/api/clinics/me` | PATCH `{ name?, description?, address?, postalCode?, city?, phone?, email?, website?, trustpilotUrl?, trustpilotScore?, trustpilotReviewCount? }` | `ClinicProfileDto & { status: ClinicStatus; cvr: string }` (forhåndsvisning af fuld profil uanset status) |
| POST/DELETE `/api/clinics/me/logo` | multipart `file` | `{ logoUrl }` / 204 |
| GET/PUT `/api/clinics/me/prices` | PUT `{ prices: { serviceId, priceMin, priceMax, durationMin, note? }[] }` (erstatter hele listen) | `{ prices: ClinicPriceDto[] }` |
| GET/PUT `/api/clinics/me/opening-hours` | PUT `{ hours: { weekday, opensAt: "HH:MM", closesAt: "HH:MM", isEmergency }[] }` | `{ hours: OpeningHoursDto[] }` |
| GET/POST `/api/clinics/me/time-blocks` | POST `{ startsAt, endsAt, note? }`; GET `?from=&to=` | `{ blocks: { id, startsAt, endsAt, note }[] }` / 201 |
| DELETE `/api/clinics/me/time-blocks/{id}` | | 204 |
| GET/POST `/api/clinics/me/dentists` | POST `{ fullName, title?, bio?, sortOrder? }` | `{ dentists: … }` / 201 |
| PATCH/DELETE `/api/clinics/me/dentists/{id}` | PATCH samme felter valgfri | dentist / 204 (sletter også portræt og portefølje) |
| POST/DELETE `/api/clinics/me/dentists/{id}/photo` | multipart `file` | `{ photoUrl }` / 204 |
| POST `/api/clinics/me/portfolio` | multipart: `file`, `dentistId`, `serviceId?`, `caption?`, `patientConsentConfirmed: "true"`, `consentTextVersion` | 201 portfolio item; 400 uden bekræftelse |
| PATCH/DELETE `/api/clinics/me/portfolio/{id}` | PATCH `{ caption?, serviceId? }` | item / 204 |
| GET `/api/clinics/me/reviews` | | `{ reviews: (PublicReviewDto & { replyStatus: ModerationStatus \| null })[] }` |

### 10.9 Leads

```ts
// lib/types/leads.ts
export type LeadStatus = "sent" | "accepted" | "declined" | "booked" | "withdrawn";
export type LeadDeclineReason = "no_capacity" | "not_offered" | "needs_referral" | "other";

export type PatientLeadDto = {
  id: string;
  clinic: { id: string; name: string; city: string; logoUrl: string | null };
  status: LeadStatus;
  sentAt: string; respondedAt: string | null;
  listPrice: PriceRange | null;
  quotedPrice: PriceRange | null;
  clinicComment: string | null;
  declineReason: LeadDeclineReason | null;
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
  sentAt: string; seenAt: string | null;
  unreadMessages: number;
};

export type ClinicLeadDetailDto = ClinicLeadListItemDto & {
  services: ServiceDto[];
  summaryText: string; summaryAiAssisted: boolean;
  images: (ImageDto & { approvedDescription: string | null })[];
  listPrice: PriceRange | null;
  decision: { comment: string | null; quotedPrice: PriceRange | null; declineReason: LeadDeclineReason | null; declineNote: string | null; respondedAt: string } | null;
  booking: ClinicBookingDto | null;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads` | klinik (verificeret) | `?status=` | `{ leads: ClinicLeadListItemDto[] }` (`clinic_leads()`) |
| GET `/api/leads/{id}` | klinik (ejer) | | `ClinicLeadDetailDto`. Sætter `seen_at` via `clinic_mark_lead_seen()` (pragmatisk sideeffekt) |
| POST `/api/leads/{id}/decision` | klinik (ejer, verificeret) | `{ decision: "accept", comment?, quotedPriceMin?, quotedPriceMax? }` eller `{ decision: "decline", reason, note? }` | `ClinicLeadDetailDto`; 409 hvis ikke `sent` (fx trukket tilbage), 409 `HOLD_EXPIRED` for akut-lead efter den reserverede starttid. Accept af akut-lead gør den reserverede tid til en booking |

For et lead med status `withdrawn` returnerer `GET /api/leads` og `GET /api/leads/{id}` kun `id`, `status`, `sentAt` og `withdrawnAt`; øvrige felter er tomme (5.7).

Patienten læser sine leads via `GET /api/cases/{id}/leads` (10.5).

### 10.10 Bookinger

```ts
// lib/types/bookings.ts
export type BookingStatus = "held" | "booked" | "completed" | "no_show" | "cancelled"; // altid effektiv status (4.2)
export type PatientBookingDto = {
  id: string; leadId: string; clinic: { id: string; name: string; address: string; city: string };
  service: { id: string; name: string }; startsAt: string; endsAt: string; status: BookingStatus;
  canCancel: boolean; canReview: boolean;
};
export type ClinicBookingDto = {
  id: string; leadId: string; service: { id: string; name: string };
  startsAt: string; endsAt: string; status: BookingStatus;
  contact: { name: string; phone: string; email: string } | null;   // kun booked/completed (5.5), aldrig held
  canMarkNoShow: boolean;              // starts_at <= nu < ends_at
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads/{id}/availability` | patient (ejer af sagen) | `?serviceId=&from=&to=` | `{ slots: SlotDto[] }` (som 10.7, men kun for leadets klinik og sagens ydelser) |
| POST `/api/leads/{id}/booking` | patient (ejer), lead `accepted` | `{ serviceId, startsAt, contactName, contactPhone }` | 201 `PatientBookingDto`; 409 `SLOT_TAKEN`, `LEAD_NOT_ACCEPTED`, `SLOT_UNAVAILABLE` |
| GET `/api/bookings` | patient: egne; klinik: egne (`?from=&to=`) | | `{ bookings: PatientBookingDto[] }` eller `{ bookings: ClinicBookingDto[] }` |
| POST `/api/bookings/{id}/cancel` | patient eller klinik (ejer), før starttid | | `PatientBookingDto` / `ClinicBookingDto` |
| POST `/api/bookings/{id}/no-show` | klinik (ejer), mellem start- og sluttid | `{}` | `ClinicBookingDto`; 409 `NO_SHOW_WINDOW_CLOSED` |
| GET og POST `/api/cron/complete-bookings` | intern (`CRON_SECRET`), hver time | | 200 `{ completed: number, releasedHolds: number }`. Kalder `complete_due_bookings()` med service role. Undtaget fra vilkårs-gaten |

Der findes ingen route til at markere et besøg gennemført; det sker automatisk efter sluttid (4.2, 8.1).

### 10.11 Akutvej

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| POST `/api/emergency-leads` | patient med konto (anonyme: 403 `ACCOUNT_REQUIRED`), aktivt `health_data_sharing` | `{ clinicId, serviceId (akut), startsAt, description (10-1000), contactName, contactPhone, postalCode? }` | 201 `{ caseId, lead: PatientLeadDto }` med `booking.status = "held"`. Opretter sag (`is_emergency`, `summary_text = description` godkendt af patienten, ydelsen bekræftet) og kalder `send_leads(…, requested_*, contact_*)`, som reserverer tiden. 409 `SLOT_TAKEN`, `SLOT_UNAVAILABLE` |

### 10.12 Beskeder

Bygget for svar; tilpasses til leads.

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads/{id}/messages` | deltager | | `{ messages: MessageDto[] }` (markerer modtagne som læst) |
| POST `/api/leads/{id}/messages` | deltager, lead `sent`/`accepted`/`booked` | `{ body }` (1-2000) | 201 `MessageDto`; 409 `THREAD_CLOSED` ved `declined`/`withdrawn` |

`MessageDto = { id, fromMe, body, createdAt, readAt }`. Polling hvert 15. sekund på åben tråd.

### 10.13 Anmeldelser

```ts
export type PublicReviewDto = {
  id: string; stars: number; text: string; priceAccuracy: PriceAccuracy;
  actualPrice: number | null; lackedTransparency: boolean | null; transparencyComment: string | null;
  verifiedVisit: true; createdMonth: string; reply: { text: string; createdAt: string } | null;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/reviews/eligible` | patient | | `{ items: { bookingId, clinicId, clinicName, serviceName, visitedOn, priceEstimate: PriceRange \| null }[] }` |
| GET `/api/reviews/mine` | patient | | `{ reviews: (PublicReviewDto & { moderationStatus, rejectionReason })[] }` |
| POST `/api/reviews` | patient | `{ bookingId, stars, text, priceAccuracy, actualPrice?, lackedTransparency?, transparencyComment? }` | 201 `{ id, moderationStatus: "pending" }`; 403 uden gennemført booking; 409 allerede anmeldt |
| POST `/api/reviews/{id}/reply` | klinik (anmeldt) | `{ text }` | 201 `{ id, moderationStatus: "pending" }` |

`clinicId` udledes på serveren fra `bookingId`.

### 10.14 Admin

Hele admin-API'et er [IKKE BYGGET] og ikke planlagt i demoen: moderation (`/api/admin/moderation`) og klinikstatus (`/api/admin/clinics/{id}/status`) [UDSKUDT].

---

## 11. Byggetrin og status

Start på omlægningen 2026-10-12. Hvert trin afsluttes med reviewer og tester; security køres ved ændringer i login, databaseregler og billeder, før merge til main og før demo. Opgaverne pr. trin står i `docs/arbejdsplan.md`.

| Trin | Indhold | Status |
|---|---|---|
| 0 Database og oprydning | Nyt samlet migrationssæt (nedenfor), `supabase/config.toml`, `seed.sql`, nyt seed-script, RLS-tests, fjernelse af den gamle domænekode (12.5) | [IKKE BYGGET] |
| 1 | Ydelseskatalog, klinikprofil med prisliste, åbningstider og tandlæger (inkl. klinik-signup, rollen `clinic`, `/klinik`) | [IKKE BYGGET] |
| 2 | Forside, klinikoversigt med kort, filtre og klinikprofil | [IKKE BYGGET] |
| 3 | AI-chat med billeder, forslag til ydelser og opsummering | [IKKE BYGGET]. Anonym session, billedupload og AI-klient findes fra den gamle model |
| 4 | Sammenligning og leads til op til 3 klinikker | [IKKE BYGGET] |
| 5 | Klinikkens indbakke: accepter eller afvis | [IKKE BYGGET] |
| 6 | Booking i klinikkens kalender og anmeldelser efter besøget | [IKKE BYGGET] |
| 7 | Akutvej, demodata og finpudsning | [IKKE BYGGET] |
| Infrastruktur | Vilkårs-gate, MVC-lag med ESLint, auth, anonym session, samtykker, billedbehandling, UI-komponenter | Bygget |

**Migrationer:** det gamle sæt (27 filer) er kørt i det fælles Supabase-projekt og beskriver den gamle model. Det slettes og erstattes af et nyt, samlet sæt, og databasen nulstilles (ingen rigtige data). Det nye sæt:

| Fil | Indhold |
|---|---|
| `20261012000000_extensions_enums.sql` | `btree_gist`, alle enums (4.2) |
| `20261012000100_profiles_terms_consents.sql` | `profiles`, `patients`, `terms_acceptances`, `consent_text_versions`, `consents`, `postal_codes`, hjælpefunktioner uden domæneafhængighed |
| `20261012000200_services_catalog.sql` | `services` + startkatalog |
| `20261012000300_clinics.sql` | `clinics`, `clinic_prices`, `clinic_opening_hours`, `clinic_time_blocks`, `clinic_dentists`, `portfolio_items`, `clinics_guard()`, `admin_set_clinic_status()` |
| `20261012000400_auth_triggers.sql` | `handle_new_user()` (patient, klinik, anonym, CVR-tilknytning), `is_anonymous`-spejl |
| `20261012000500_cases_ai.sql` | `cases`, `case_services`, `ai_conversations`, `ai_messages`, AI-lofter og -funktioner (inkl. `try_consume_anonymous_ai_call(p_user_id)`) |
| `20261012000600_case_images_storage.sql` | `case_images`, buckets `case-images` og `public-media`, storage-regler |
| `20261012000700_leads_messages.sql` | `leads`, `messages`, `clinic_mark_lead_seen()`. `send_leads()`, `clinic_decide_lead()` og `withdraw_lead()` ligger i bookingfilen, fordi de opretter og ændrer `held`-bookinger |
| `20261012000800_bookings.sql` | `bookings`, udelukkelse (inkl. `held`), `booking_effective_status()`, `send_leads()`, `clinic_decide_lead()`, `withdraw_lead()`, `book_slot()`, `cancel_booking()`, `mark_booking_no_show()`, `complete_due_bookings()` |
| `20261012000900_reviews.sql` | `reviews`, `review_replies`, statistik |
| `20261012001000_read_functions.sql` | `clinic_*` og `public_*` (5.3, 5.7) |
| `20261012001100_consent_withdrawal_cleanup.sql` | `withdraw_consent()`, `confirm_consent_cleanup()`, `touch_last_active()`, `consume_rate_limit()` |

**Nedskæring** hvis tiden ikke slår til, i denne rækkefølge: portefølje → klinikkens svar på anmeldelser → beskedtråd → kort (listen er nok) → akutvindue (akutvejen bruger almindelige tider). Skæres **aldrig**: isolation af leads og skjulte kontaktoplysninger (RLS), samtykke før chat/upload/deling, AI-reglerne (ingen priser, ingen klinikanbefaling, akut-henvisning), maks. 3 leads, ingen dobbeltbooking, "Slet min samtale" og oprydning af anonyme data.

---

## 12. Risici, åbne og udskudte beslutninger

### 12.1 Kendte risici

| Risiko | Konsekvens | Afbødning |
|---|---|---|
| Fejl i RLS eller en læsefunktion (fx en ekstra SELECT-policy på `leads` eller `bookings`) | Klinikker ser hinandens leads eller patientdata | Klinikker læser kun via `clinic_*`; tests 1-5 i 5.6; security før merge |
| Kontaktoplysninger lækker før booking (fx via beskedtråd, DTO, logs eller en join) | Brud på princip 4 | Kontakt kun i `bookings.contact_*`; ingen klient-SELECT på `bookings`; test 5; reviewer tjekker DTO'er |
| Overtagelse af importeret klinik via CVR uden bevis [PROTOTYPE] | Uvedkommende redigerer en rigtig kliniks grunddata | `cvr` kan ikke ændres; leads kræver verifikation af admin; afklares før rigtige brugere (12.3) |
| Foreløbig vurdering og forklaring af behandlinger | Kan gøre produktet til medicinsk udstyr (MDR) | Fast mærkat, ingen endelige diagnoser, regler samlet i `rules.ts`, faglig vurdering før rigtige patienter (12.4) |
| AI'en nævner priser eller klinikker | Brud på kerneprincip, vildledning | AI'en får ingen pris- eller klinikdata; skema uden felter; filter; provokationstests |
| Akutte tegn overses af AI'en | Patientsikkerhed | Fast akut-indgang på forsiden og i chatten uafhængigt af AI'en; tests med akutte symptomer |
| Porteføljebilleder uden gyldigt samtykke | GDPR art. 9, klinikkens ansvar men vores platform | Bekræftelse med tekstversion og tidspunkt; ingen ansigter; juridisk afklaring (12.4) |
| Dobbeltbooking ved samtidige kald | To patienter får samme tid | Udelukkelse i databasen, ikke kun tjek i koden; test 7 |
| Klinikken markerer et besøg som udeblevet for at undgå en anmeldelse | Skæve anmeldelser | `no_show` kan kun sættes, mens tiden står på; tidspunktet gemmes (`no_show_at`) og kan følges op |
| Ubesvarede leads | Patienten venter | Patienten kan trække et ubesvaret lead tilbage og vælge en anden klinik; intet automatisk udløb |
| Ubegrænset antal leads pr. sag over tid (afvis/træk tilbage og send igen) | Spam af klinikker | Samme klinik kan ikke få sagen to gange; loft over det samlede antal er åbent (12.3) |
| Reserveret akuttid uden svar | Tiden er blokeret for andre patienter, til starttiden passerer | Reservationen frigives ved afvisning, tilbagetrækning og ved starttid; patienten kan trække tilbage når som helst |
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
| Klinikstatus `imported` / `registered` / `verified`; kun `verified` modtager leads og bookinger | 3, 6.6 |
| Ydelseskatalog i databasen; prisliste pr. ydelse med interval og varighed | 4.3 |
| Maks. 3 aktive leads pr. sag, valgt af patienten; afviste og tilbagetrukne tæller ikke; konto og delingssamtykke kræves | 4.3, 5.3 |
| Patienten kan trække et ubesvaret lead tilbage; leads udløber ikke | 4.2, 5.3 |
| Beskedtråden er åben fra leadet er sendt; kontaktoplysninger er skjult til booking, derefter ser klinikken navn, telefon og e-mail | 4.3, 4.4 |
| Booking er gennemført automatisk efter sluttid, medmindre klinikken har markeret udeblivelse | 4.2, 8.1 |
| Akutvejen kræver login; den valgte tid reserveres straks og bliver en booking ved accept, frigives ved afvisning | 4.3, 6.1 |
| Importerede og oprettede (ikke verificerede) klinikker vises på basisniveau med Trustpilot, uden egne anmeldelser | 3, 6.6, 8.4 |
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
9. **Ydelseskatalogets indhold:** endelig liste over kosmetiske, almindelige og akutte ydelser og deres standardvarighed.
10. *Afklaret:* klinikken ser både telefon og e-mail efter booking (4.4). Oprettede, men ikke verificerede klinikker vises på basisniveau ligesom importerede i prototypen (3, 6.6).
11. **Porteføljebilleder:** krav til samtykket (skriftligt, opbevares af klinikken), og må billeder vise ansigt?
12. **Standardsortering:** afstand med position, ellers første ledige tid. Ønsker gruppen en anden standard?
13. **Præcis geokodning** af klinikadresser (i dag postnummerets centrum, hvis importen ikke har koordinater).
14. **Præcis fremvisningsdato** og hosting af Next.js-appen.
15. **Ønsket tidsrum:** er de fire faste valg (hurtigst muligt, inden for 2 uger, inden for 3 måneder, fleksibel) nok, eller ønskes konkrete datoer?
16. **Frist for udeblivelse:** nu kan klinikken kun markere `no_show`, mens tiden står på (fra start- til sluttid). Skal der være en kort frist efter sluttid (fx 24 timer)? I så fald må anmeldelser først kunne skrives, når fristen er udløbet.
17. **Loft over det samlede antal leads pr. sag:** da afviste og tilbagetrukne ikke tæller, kan en sag over tid sendes til mange klinikker (dog højst én gang pr. klinik). Ønskes et samlet loft (fx 10)?
18. **Reserveret akuttid uden svar:** nu holdes tiden, til starttiden passerer, og accept derefter afvises (`HOLD_EXPIRED`). Skal reservationen i stedet udløbe efter fx 15-30 minutter uden svar, så patienten hurtigere kan vælge en anden klinik?
19. **Trustpilot for importerede klinikker:** hvem indtaster score og link for klinikker uden konto (admin manuelt), og hvor ofte opdateres de? Scraping er ikke tilladt.
20. **Tilbagetrukne leads:** klinikken mister adgangen til sagens indhold og beskeder, når patienten trækker leadet tilbage (dataminimering). Er det ønsket, eller skal klinikken kunne se tråden?

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

### 12.5 Overgang fra den gamle model

Koden indeholder stadig den gamle model (forespørgsler, tandlæger, svar, standard-spor). Indtil den er fjernet, gælder:
- Den gamle domænekode fjernes samlet lige efter det nye migrationssæt (opgave 0.9 i `docs/arbejdsplan.md`), fordi den ikke kan køre mod det nye skema. Det, der kan genbruges, hentes fra git (`e5cf7a04`), når afløseren bygges. Der er dermed aldrig to versioner af samme ting (besluttet).
- Den genbrugte kerne (auth, session, vilkår, samtykker, patienter, oprydning, billedbehandling) omskrives i samme trin til klasser efter 2.1.1, så al backendkode følger samme mønster fra trin 1.
- `docs/omlaegning.md` er arbejdsredskabet for, hvad der genbruges; den slettes, når omlægningen er færdig.
- Den gamle fejl i `try_consume_anonymous_ai_call()` (bruger `auth.uid()` under service role, så anonym chat altid får 429) løses af det nye migrationssæt (5.1 regel 8, 5.3).
