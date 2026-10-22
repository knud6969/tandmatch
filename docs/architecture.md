# TandMatch: arkitektur (oversigt)

Version: 3.0 (2026-10-22). Kort oversigt over lag, regler, domæner og hvor tingene ligger. Detaljerne (datamodel, RLS, API-kontrakter, AI-regler) står i README'en for det domæne, de hører til. Afsnitsnumrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes via tabellen i 0.2.
Ejer: architect-agenten. Ændringshistorik: `git log -p -- docs/architecture.md features/*/README.md platform/README.md mobile/README.md`.

## 0. Sådan bruges dokumentet

- Dokumenterne er **sandheden** for datamodel, roller, RLS, routes og API-kontrakter. Skal noget ændres, rettes det relevante dokument først, derefter koden.
- **[ÅBEN]** ikke besluttet · **[UDSKUDT]** bevidst ikke med nu · **[PROTOTYPE]** bevidst forenkling · **[IKKE BYGGET]** besluttet, men ikke implementeret.
- Status, demo-scope, byggetrin, risici og beslutninger: `docs/beslutninger.md` (0.1, 1.1, 11, 12). Sikkerhed og GDPR: `docs/security.md`.

### 0.2 Hvor står afsnittet?

| Afsnit | Emne | Fil |
|---|---|---|
| 0.1, 1.1, 11, 12 | Prototype-status, demo-scope, byggetrin, risici og beslutninger | `docs/beslutninger.md` |
| 1, 1.2, 2, 2.1, 2.2, 2.6 | Overblik, to applikationer, struktur, grænser, domæner og ny funktion | dette dokument |
| 2.1.1, 2.3-2.4 | Klasser, nøgler og hosting, API-konventioner | `platform/README.md` |
| 2.5, 3 | Vilkårs-gate, roller og rettigheder | `features/identity/README.md` |
| 4 (intro), 4.1-4.2 | Relationsoverblik og enums | `platform/README.md` |
| 4.3 | Tabeller, fordelt på domænerne (`consent_text_versions`, `postal_codes` og tællere i `platform/README.md`) | `features/<domæne>/README.md` |
| 4.4, 5.5, 5.7 | Hvad klinikken ser, isolation, klinikkens læsevisninger | `features/leads/README.md` |
| 5.1-5.4, 5.6 | RLS-grundregler, hjælpefunktioner, RPC'er, policies, RLS-tests | `platform/README.md` |
| 6.1 | Offentlige sider | `features/site/README.md` |
| 6.2 | Patientfladen (flyttet til appen) | `mobile/README.md` |
| 6.3, 6.6, 6.7 | Klinikflade, klinikoversigt og rangering, ledige tider | `features/clinics/README.md` |
| 6.4, 6.5 | Admin, beskyttelse af sider | `platform/README.md` |
| 7 | AI-flowet, AI-reglerne og sagsflowet som samtale | `features/cases/README.md` |
| 8 | Anmeldelser og prisnøjagtighed | `features/booking/README.md` |
| 9.1 | Storage-buckets | `platform/README.md` |
| 9.2-9.4 | Sagsbilleder | `features/cases/README.md` |
| 9.5 | `public-media` | `features/clinics/README.md` |
| 10.1, 10.14 | Delte typer, admin | `platform/README.md` |
| 10.2-10.3 | Auth, sessioner, konto, samtykker | `features/identity/README.md` |
| 10.4, 10.7, 10.8 | Katalog, klinikoversigt og profil, egen klinik | `features/clinics/README.md` |
| 10.5, 10.6 | Sager og AI-chat | `features/cases/README.md` |
| 10.9, 10.11, 10.12 | Leads, akutvej, beskeder | `features/leads/README.md` |
| 10.10, 10.13 | Bookinger, anmeldelser | `features/booking/README.md` |
| 13 | Patient-appen | `mobile/README.md` |

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
5. **AI'en vurderer ikke endeligt og sælger ikke.** Den spørger ind, forklarer behandlinger og må give en foreløbig vurdering, altid markeret som foreløbig. Den oversætter ønsket til ydelser fra kataloget, som patienten bekræfter. Den nævner aldrig priser og anbefaler aldrig en klinik. Priser kommer fra klinikkernes prislister, og rækkefølgen af klinikker bestemmes af faste, synlige kriterier (6.6). Reglerne samles i `features/cases/ai/` (7.8).
6. **Helbredsdata (GDPR art. 9).** Tekst, chat og billeder om patientens mund er helbredsdata. Eksplicit samtykke før AI-behandling, upload og deling; dataminimering over for klinikker og OpenAI.
7. **MVC med adskilt frontend og backend.** Databasen tilgås kun via API-routes (2.1), både fra klinikkernes web og fra patienternes app. REST og JSON, men pragmatisk, hvis det giver bedre UX.
8. **Simpelt.** Ingen ekstra infrastruktur (køer, caches, realtime, streaming). Next.js + Supabase (EU-region) + OpenAI, og en Expo-app til patienterne.

### 1.2 To applikationer i ét repo

| Applikation | Hvem | Mappe | Teknik |
|---|---|---|---|
| **Klinik-web og backend** | klinikker (web) og alle klienter (API) | repoets rod | Next.js (App Router), Tailwind, Supabase, OpenAI |
| **Patient-app** | patienter | `mobile/` | Expo (managed) med React Native, TypeScript og Expo Router |

Patientsiderne på weben er fjernet (2026-10-22); appen har hele patientrejsen og bruger det samme API. Delt kode er kun `lib/`, som server, web og app importerer. Appen er en selvstændig npm-pakke med egen `package.json` (ingen workspaces).

## 2. Struktur og regler

Koden er organiseret efter funktion (domæne), og MVC er bevaret inde i hvert domæne.

```
app/                       Next.js-ruter. page.tsx/layout.tsx videresender til features/<domæne>/pages; app/api/**/route.ts kalder én controller
features/<domæne>/         ét domæne: identity, cases, clinics, leads, booking, site
  <x>Controller.ts         forretningsregler; tager typet input og returnerer DTO'er
  <x>Repository.ts         eneste sted, der kalder Supabase (arver platform/base/BaseRepository)
  <x>Service.ts            delt logik (fx AI, rangering, ledige tider)
  ai/                      kun cases: AI-reglerne, prompts, guard og OpenAI-klient samlet ét sted (7.8)
  components/ pages/ utils/  web-UI for domænet
  index.ts                 serverkode, som andre domæner må importere
  ui.ts                    klientsikre komponenter, som andre domæners UI må importere
  __tests__/               unit-tests; __tests__/api/ har API-testene
  README.md                domænets afsnit af arkitekturen
platform/                  tværgående: middleware/, db/, base/, cron, billedbehandling, ui-utils/ (api-client, use-load m.fl.)
components/ui/             delte UI-komponenter og layout (header, footer, faner)
lib/<domæne>/<art>/        delt med appen: types, schemas, constants, domain; lib/common/ for fælles ting og navigation
mobile/                    patient-appen (Expo); importerer kun @/lib fra roden
supabase/                  migrationer, seed og data (postnumre)
tests/rls/ tests/e2e/ tests/api/  RLS-tests, Playwright (web) og API-testenes runner og hjælpere
docs/                      denne oversigt, beslutninger, security og arbejdsplan
```

### 2.1 Regler (håndhæves af `npm run lint`)

- **Lagene i et domæne:** route → controller → repository/service. Controllere kalder ikke hinanden; delt logik hører i en service. Kun repositories kalder Supabase. UI (`components/`, `pages/`, `utils/`) henter data via `/api` med `platform/ui-utils/api-client` og importerer aldrig repositories, controllere, services eller `ai/`.
- **Mellem domæner:** et domæne importerer kun andre domæners `index.ts` (serverkode) eller `ui.ts` (klientsikre komponenter), aldrig deres interne filer. Serverkode importerer ikke UI.
- **platform/** kender ingen domæner. Undtagelser: `platform/cronController.ts` og `platform/middleware/{session,termsGate}.ts` bruger `features/identity` og `features/booking` via `index.ts`.
- **components/ui/** bruger kun `lib/`, `platform/ui-utils` og domænernes `ui.ts`.
- **lib/** importerer kun `lib/` og `zod`, fordi appen deler den. Danske labels og tekster til enums og fejlkoder ligger i `lib/`, så server, web og app bruger samme tekst.
- **app/** sider og layouts videresender til `pages/`; routes kalder én controller og henter kun klientfabrikken fra `platform/db`.
- **mobile/** importerer kun `@/lib` fra roden (egen lint i `mobile/eslint.config.mjs`).
- **Ren kode** (`features/cases/ai/{rules,guard,pii,…}`, `rankingService`, `availabilityService`) har ingen I/O og ingen `server-only`, så den kan testes direkte.
- Alle andre filer med serverkode starter med `import "server-only"`. Type-imports er tilladt på tværs. Relative imports op ad træet (`../`) er forbudt; brug `@/…`.
- **Ændringer holdes i domænet:** en opgave i fx booking ændrer filer i `features/booking/` (og evt. `lib/booking/`, migrationer og tests). Kræver den ændringer i et andet domæne, sker det via det domænes `index.ts`/`ui.ts` og nævnes i opgaven.
- **Navngivning:** klasser i PascalCase i camelCase-filer (`leadsController.ts` → `LeadsController`), én klasse pr. fil; UI og `lib/` i kebab-case. Ressourcenavne på engelsk i kode og API, danske slugs i sider (`/klinikker`).

### 2.2 Domænerne og mappestrukturen

| Domæne | Ansvar | Ruter |
|---|---|---|
| `identity` | login, signup, sessioner (cookie og bearer), vilkår, samtykker, patientprofil, eksport, sletning | `/login`, `/opret`, `/vilkaar`, `/api/auth/*`, `/api/session/*`, `/api/terms/*`, `/api/consents`, `/api/patients/me`, `/api/me` |
| `cases` | sager, AI-chat, opsummering, sagsbilleder, AI-reglerne | `/api/cases/*` |
| `clinics` | klinikprofil, katalog, prisliste, åbningstider, tandlæger, portefølje, klinikoversigt, rangering, ledige tider | `/klinikker`, `/klinik/{profil,prisliste,aabningstider,tandlaeger}`, `/api/clinics/*`, `/api/services` |
| `leads` | leads, klinikkens indbakke og lead-kort, beskeder, akutvejen | `/klinik`, `/klinik/lead/*`, `/api/leads/*`, `/api/emergency-leads` |
| `booking` | bookinger, kalender, anmeldelser, svar, moderation | `/klinik/kalender`, `/klinik/anmeldelser`, `/api/bookings/*`, `/api/reviews/*`, `/api/cron/*` |
| `site` | forsiden og informationssiderne | `/`, `/om-os`, `/kontakt`, `/privatliv`, `/saadan-*`, `/for-klinikker` |

### 2.6 Sådan bygger du en ny funktion

1. Find domænet i 2.2, og ret først domænets README (kontrakt, tabel, regler).
2. Migration i `supabase/migrations/` (ny fil, ret aldrig en kørt migration) og RLS-test i `tests/rls/`.
3. Typer, skemaer og tekster i `lib/<domæne>/`.
4. Repository → service (hvis delt logik) → controller → route i `app/api/`.
5. UI i `features/<domæne>/components` og `pages`, og en tynd `app/**/page.tsx`. Patientfunktioner bygges i `mobile/`.
6. Tests i `features/<domæne>/__tests__/` (unit og `api/`) og evt. `tests/e2e/`. `npx tsc --noEmit`, `npm run lint` og testene skal bestå.
