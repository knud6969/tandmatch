# Patient-appen (`mobile/`)

Expo/React Native-appen til patienter. Den deler kun `lib/` med serveren og kalder Next.js-API'et med bearer-token.

Start: `cd mobile && cp .env.example .env && npm install && npx expo start`, derefter `i` for iOS-simulatoren. På en iPhone sættes `EXPO_PUBLIC_API_URL` til Mac'ens LAN-IP, og serveren startes med `npm run dev -- -H 0.0.0.0`.

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 6. Sider og routes (App Router)

### 6.2 Patientflade (`/patient`, rolle `patient`, permanent konto) – flyttet til appen

Siderne nedenfor findes og virker, men udvikles ikke videre; patientens flade er appen (13.4). Tabellen beskriver dem, som de er.

| Route | Indhold |
|---|---|
| `/patient` | Mine sager med status, leads (status pr. klinik) og sagens næste booking (`CaseListItemDto.nextBooking`, vises fra 6.7). Bygget i 4.3; bookingerne har egen side, `/patient/bookinger` |
| `/patient/sag/[caseId]` | Sagen: hvert lead med klinik, status, klinikkens kommentar, præciseret pris og listepris, "Træk tilbage" ved ubesvaret lead, "Book tid" ved accepteret lead, beskedtråd pr. lead (åben fra afsendelse), "Kontakt flere klinikker" (når `canSendCase` tillader det) og "Luk sag". Bygget i 4.3: leads, "Træk tilbage" og "Kontakt flere klinikker"; i 5.3: beskedtråd pr. lead; i 5.5: klinikkens afvisningsnote under årsagen. i 6.3: "Book tid" og bookingen med "Aflys" på leadet. **"Luk sag"** (bygget i 7.5, `close-case.tsx`): knap nederst på siden for en sag med status `submitted` (en kladde slettes i stedet med "Slet samtale" i sagsflowet). Bekræftelse med konsekvensen: "Henvendelser, som klinikken ikke har svaret på, og accepterede henvendelser uden booket tid trækkes tilbage, og en reserveret akuttid frigives. Bookede tider består; du kan aflyse dem under Bookinger." (samme formulering som `CONSENT_WITHDRAW_CONSEQUENCE.health_data_sharing`; teksten står som konstant `CLOSE_CASE_CONSEQUENCE` i `lib/cases/constants/cases.ts`, så appen bruger samme tekst; bygget i 7.12b) Kalder `POST /api/cases/{id}/close` (10.5, findes) og henter sagen og leads igen; en lukket sag viser badget "Lukket", ingen "Kontakt flere klinikker" og ingen "Luk sag" |
| `/patient/sag/[caseId]/book/[leadId]` | (6.7: på mobil en fast bundlinje med den valgte tid og "Book tid"; dagsgrupperne viser datoer, ikke "Dag 15 til 28") Vælg ydelse (blandt sagens bekræftede), vælg ledig tid, indtast fulde navn og telefon (forudfyldt), book. Tider vises pr. dag (6 ad gangen, "Vis flere tider"), bladring 14 dage ad gangen inden for bookinghorisonten; ved `SLOT_TAKEN`/`SLOT_UNAVAILABLE` hentes tiderne igen. Link "Book tid" fra det accepterede lead på sagen. Bygget i 6.3 |
| `/patient/bookinger` | Kommende og tidligere bookinger; aflys før starttid (med bekræftelse). Punktet "Bookinger" i patientens navigation. Bygget i 6.3 |
| `/patient/anmeldelser`, `/patient/anmeld/[bookingId]` | Gennemførte bookinger, der kan anmeldes, mine anmeldelser; anmeldelsesformular. Bygget i 6.5: `/patient/anmeldelser` viser besøg med "Skriv anmeldelse" og egne anmeldelser med status ("Afventer godkendelse", "Offentliggjort", "Afvist" med begrundelse) og klinikkens godkendte svar; formularen (stjerner som radioknapper på 48 px, tegntæller, prisnøjagtighed, valgfri faktisk pris, gennemsigtighed) viser prisoverslaget og en moderationsnote, og et ukendt eller ikke-anmeldbart `bookingId` giver en venlig besked. "Skriv anmeldelse" står også på bookingen (bookingoversigten og sagens lead). Punktet "Anmeldelser" i navigationen |
| `/patient/samtykker` | Bygget i 7.7: samtykker, tilbagetrækning, dataeksport (`consents-list.tsx`, `data-export-button.tsx`; eksportknappen står også på `/patient/konto`). Én række pr. samtykketype med `CONSENT_TYPE_LABEL`, den tekst patienten har godkendt (`CONSENT_TEXTS` for gældende version; ældre version vises som "Du har givet samtykke til en ældre tekst" med knap til at give det igen), tidspunkt og status. "Træk tilbage" viser `CONSENT_WITHDRAW_CONSEQUENCE` og kræver bekræftelse; tilbagetrækning gælder hele typen, også et ældre samtykke (4.3); efter `POST /api/consents/{id}/withdraw` vises `withdrawnLeads` ("n henvendelser er trukket tilbage") og ved `health_data_sharing` en henvisning til at aflyse bookede tider under Bookinger. Dataeksport: knap, der henter `GET /api/patients/me/export` og gemmer JSON-filen i browseren (`tandmatch-data-YYYY-MM-DD.json`) |
| `/patient/konto` | Bygget i 7.7. Profil (fornavn, postnummer, telefon) med `GET`/`PATCH /api/patients/me` (tom telefon rydder nummeret), link til samtykker og dataeksport, og slet konto (`delete-patient-account.tsx`; `DELETE /api/patients/me` med `{ confirm: "SLET" }`, advarsel om, at alt slettes med det samme: sager, billeder, samtaler, samtykker, henvendelser, beskeder, bookinger (også kommende tider, som dermed forsvinder fra klinikkens kalender) og anmeldelser; derefter logud og forsiden. Det er sådan, databasen sletter i dag (cascade fra `patients`) [PROTOTYPE, 12.3 punkt 35]). Patientens navigation får punktet "Konto" (`AREA_NAV.patient`: Mine sager, Bookinger, Anmeldelser, Konto); samtykkesiden nås fra kontosiden og markerer "Konto" (`AREA_NAV_PARENT`) |

## 13. Patient-appen (`mobile/`)

Status: [IKKE BYGGET], trin 8 (`docs/arbejdsplan.md`). Besluttet 2026-10-19 (12.3 punkt 37). Appen er patienternes eneste flade fremover. Den er en ren klient: al logik om adgang, samtykke, lofter, AI og rangering ligger på serveren og i databasen og er uændret. Appen genbruger API'et i afsnit 10 og typerne, skemaerne og teksterne i `lib/`.

### 13.1 Valg og rammer

- **Expo, managed workflow**, TypeScript (`strict`), **Expo Router** (filbaseret routing i `mobile/app/`). SDK-versionen er den, som den aktuelle Expo Go i App Store understøtter (Expo Go kører kun én SDK ad gangen); `npx expo-doctor` skal bestå.
- **Kun iOS testes:** Expo Go på iPhone og iOS-simulatoren på en Mac. Layout tjekkes på en almindelig iPhone (fx iPhone 16, 393 × 852 pt) og en lille (iPhone SE, 375 × 667 pt), lodret. Android og app store-build er [UDSKUDT] (12.4 punkt 16).
- **Pakker** (kun pakker, der virker i Expo Go; installeres med `npx expo install`): `expo-router`, `expo-secure-store`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system` (kun hvis upload med `fetch` ikke sender `content-length`, 13.5), `expo-location`, `expo-web-browser`, `react-native-maps`, `zod` (samme hovedversion som i roden). Intet UI-bibliotek (React Native `StyleSheet` og `src/theme.ts` med samme hvide og blå farver som weben), intet state-bibliotek (React context til sessionen, ellers lokal tilstand).
- **Dansk** i al tekst. Trykflader mindst 44 × 44 pt; `accessibilityLabel` på ikonknapper.
- **Ingen nøgler i appen** ud over `EXPO_PUBLIC_API_URL` (2.3). Ingen Supabase-klient, ingen OpenAI.

### 13.2 Struktur, lagregler og deling af `lib/`

Mappetræet står i 2.2. Lagene i appen (håndhæves af `mobile/eslint.config.mjs` med `no-restricted-imports` og `no-restricted-globals` for `fetch`):

| Lag | Mappe | Ansvar | Må importere |
|---|---|---|---|
| Routing | `mobile/app/` | Expo Router-filer. `_layout.tsx` (rod) har `SessionProvider` og vilkårsvagten; `(tabs)/_layout.tsx` har fanerne. Hver rutefil re-eksporterer en skærm fra `src/screens/`; ingen logik | `~/screens/*`, `~/auth/*` (kun layouts) |
| Skærm | `mobile/src/screens/` | Én skærm pr. fil (`case-flow-screen.tsx`). Henter data via `~/api/*` med `useLoad`/`useAction`, sender data til komponenter som props | `~/components/*`, `~/api/*`, `~/hooks/*`, `~/utils/*`, `~/auth/*`, `~/theme`, `@/lib/{types,schemas,constants,domain}/*` |
| Komponent | `mobile/src/components/` | UI. `ui/` er generiske byggeklodser uden API-kald; domænemapper (`case/`, `chat/`, `clinic-directory/` …) får data og handlinger som props | `~/components/*`, `~/hooks/*`, `~/utils/*`, `~/theme`, `@/lib/…` (ikke `~/api/*`) |
| API | `mobile/src/api/` | `client.ts` er **eneste sted med `fetch`** (base-URL, headers, JSON, fejl, tokenfornyelse, 13.3). Én fil pr. ressource med tynde typede funktioner (`getCase(id): Promise<CaseDto>`), som bruger DTO-typerne fra `lib/types/` | `~/auth/tokens`, `@/lib/…` |
| Auth | `mobile/src/auth/` | `tokens.ts` (SecureStore), `terms.ts` (vilkårstoken), `session-context.tsx` (`SessionProvider`, `useSession()`: hvem er logget ind, rolle, anonym) | `~/api/*` (kun `session-context.tsx`), `@/lib/…` |
| Hjælpere | `mobile/src/hooks/`, `mobile/src/utils/` | Generiske hooks og React Native-hjælpere (billedforberedelse, position, formatering, der kræver React Native). Rene hjælpere, som weben også har, flyttes til `lib/` (2.1) | `@/lib/…`, Expo-pakker |
| Delt | `lib/` (repoets rod) | Som i 2.1. Appen bruger **ikke** `lib/navigation/` (webstier) | `lib/`, `zod` |

Navngivning: `kebab-case` for filer som i `features/<domæne>/{components,pages,utils}` (`clinic-card.tsx`), komponenter i PascalCase. Ruter på dansk uden æøå som på weben (`/klinikker`, `/sag/[caseId]`).

**Sådan deles `lib/` (det enkleste, der virker; ingen npm workspaces):**
- `mobile/tsconfig.json` udvider `expo/tsconfig.base` og har `paths`: `"~/*": ["./src/*"]` og `"@/lib/*": ["../lib/*"]`. Filerne i `lib/` importerer hinanden med `@/lib/...`, så samme alias virker i begge projekter. Expo's Metro læser `paths` fra tsconfig.
- `mobile/metro.config.js`: `getDefaultConfig(__dirname)` med `watchFolders: [path.resolve(__dirname, "../lib")]` og `resolver.nodeModulesPaths: [path.resolve(__dirname, "node_modules")]`, så `zod` i `lib/` findes i `mobile/node_modules` (Metro ser kun filer i projektet og `watchFolders`, så rodens `node_modules` bruges ikke).
- `mobile/jest.config.js` (preset `jest-expo`) har samme aliaser i `moduleNameMapper`.
- Roden ignorerer appen: `tsconfig.json` får `"exclude": ["node_modules", "mobile"]`, `eslint.config.mjs` får `mobile/**` i `globalIgnores`, og Vitest kører ikke `mobile/`. Rodens ESLint-regel for `lib/` forbyder imports af andet end `lib/` og `zod` (2.1).
- Appen importerer aldrig fra repositories (`features/<domæne>/*Repository.ts`), `features/<domæne>/*Controller.ts`, `features/<domæne>/*Service.ts`, `platform/middleware/`, `features/<domæne>/{components,pages,utils}` eller `app/` i roden, heller ikke typer. Mangler appen en type, flyttes den til `lib/types/`.

### 13.3 Auth, vilkår og API-klient

Serverdelen står i 2.4 og 2.5; ruterne i 10.2. I appen:

- **Første start:** vilkårsskærmen (to afkrydsningsfelter, links til `/vilkaar` og `/privatliv` via `expo-web-browser`) kalder `POST /api/terms/accept` og gemmer `termsToken`. Uden gyldigt vilkårstoken viser rodlayoutet kun vilkårsskærmen. Et 403 `TERMS_REQUIRED` fra et hvilket som helst kald sender til vilkårsskærmen igen.
- **`apiRequest(path, { method, json | formData })`** i `src/api/client.ts`: base-URL fra `EXPO_PUBLIC_API_URL`; sender altid `X-TandMatch-Client: mobile` og `X-Terms-Token`, og `Authorization: Bearer <accessToken>`, når der er en session; parser JSON; fejl bliver `ApiRequestError(status, code, message)`, og den danske tekst findes med `apiErrorText(code, message)` fra `lib/common/domain/errors.ts` (samme tekster som weben).
- **Fornyelse:** udløber access-tokenet inden for 60 sekunder, eller svarer et kald 401 `UNAUTHENTICATED`, kalder klienten `POST /api/auth/refresh` **én gang ad gangen** (ét fælles løfte, fordi Supabase roterer refresh-tokens, og et genbrugt token afvises efter 10 sekunder) og gentager det oprindelige kald én gang. Fejler fornyelsen, slettes tokens, og sessionen er "logget ud" (anonyme mister dermed deres kladde, som på weben efter 48 timer). 503 `AUTH_UNAVAILABLE` er ikke logud; brugeren ser "Prøv igen".
- **Opbevaring:** `expo-secure-store` med nøglerne `tm.accessToken`, `tm.refreshToken`, `tm.expiresAt` og `tm.termsToken` (hver under SecureStore-grænsen på 2048 byte) [PROTOTYPE, 0.1]. Intet i AsyncStorage.
- **Sessionen i appen** (`useSession()`): ved start med tokens hentes `GET /api/me`. Er rollen ikke `patient`, logges der ud med beskeden "Klinikker logger ind på TandMatch på weben". Anonym session (`isAnonymous`) viser et banner med udløb (`anonymousExpiresAt`) og "Opret konto".
- **Anonym start:** "Beskriv dit problem" uden konto → AI-samtykke → `POST /api/session/anonymous` (`{ aiConsent }`) → tokens gemmes → sagsflowet. Med konto: `POST /api/consents` (ved behov) og `POST /api/cases`. Konvertering: `POST /api/auth/convert` (nye tokens gemmes). Log ud: `POST /api/auth/logout`, derefter slettes tokens lokalt (også hvis kaldet fejler).

### 13.4 Skærme, API'er og hvad der skal med til afleveringen

Hele patientrejsen bygges enkelt først (bred før dyb). **P1** = skal med til afleveringen ca. 2026-10-26. **P2** = med, hvis tiden tillader det (skæres i omvendt rækkefølge). **Efter** = efter afleveringen. Alle API'er findes, inkl. `POST /api/auth/refresh` og token-delene i 10.2 (8.1).

Fanerne: **Forside**, **Klinikker**, **Mine sager**, **Konto**.

| Skærm | Rute i `mobile/app/` | API (afsnit 10) | Svarer til på weben | Prioritet |
|---|---|---|---|---|
| Vilkår | `/vilkaar` | `POST /api/terms/accept` | `/vilkaar/accepter` | P1 |
| Forside | `(tabs)/index` | – | `/` | P1: tre indgange "Beskriv dit problem", "Find en klinik", "Jeg har ondt" |
| Login og opret konto | `/login`, `/opret` | `POST /api/auth/login`, `/signup` (patient), `/convert` | `/login`, `/opret/patient` | P1 |
| Klinikoversigt, liste | `(tabs)/klinikker` | `GET /api/services`, `GET /api/clinics` (samme query-nøgler som 10.7) | `/klinikker` | P1: ydelse, postnummer eller "Brug min position", sortering, akutfilter, kriterierne vist (6.6). P2: maks. pris, min. bedømmelse, afstand |
| Klinikoversigt, kort | samme skærm, skift liste/kort | samme data | kortet på `/klinikker` | P1 (enkelt: markører, tryk åbner klinikken). Skæres som den første P1-del, hvis tiden ikke slår til (11) |
| Klinikprofil | `/klinik/[clinicId]` | `GET /api/clinics/{id}`, `/availability`, `/reviews` | `/klinikker/[clinicId]` | P1: grunddata, prisliste, åbningstider, første ledige tid, anmeldelser og prisnøjagtighed, Trustpilot (link via `expo-web-browser`), "Vælg klinik" med en sag. P2: tandlæger og portefølje |
| Start og AI-samtykke | `/start` | `POST /api/session/anonymous` eller `POST /api/consents` + `POST /api/cases` | `/start` | P1 |
| Sagsflowet | `/sag/[caseId]/flow`: **én samtale** uden separate trin (7.9) | `GET /api/cases/{id}`, `GET/POST /api/cases/{id}/chat`, `POST /api/consents`, `POST/DELETE /api/cases/{id}/images…`, `PUT /api/cases/{id}/services`, `PATCH /api/cases/{id}`, `POST/PUT /api/cases/{id}/summary`, `GET /api/services`, `GET /api/patients/me`, `DELETE /api/cases/{id}` | `/start/[caseId]` (trinflow) | P1: chat med foreløbig vurdering (mærkat) og akut-blok; svar-kort for behandlinger, tidsrum, postnummer og opsummering; billeder fra inputfeltet med samtykkekort; "Se klinikker der kan hjælpe". P2: hurtigsvar (8.6g), "Slet samtale" |
| Sammenlign og vælg | klinikoversigten med `sag`-parameter | `GET /api/clinics?services=…&postalCode=…` | `/klinikker?sag=` | P1: vælg op til `MAX_ACTIVE_LEADS_PER_CASE` minus aktive leads (`remainingLeadSlots`, `lib/leads/domain/leads.ts`); valget holdes i skærmens tilstand |
| Send | `/sag/[caseId]/send` | `/api/auth/signup` eller `/convert`, `POST /api/consents` (`health_data_sharing`), `POST /api/cases/{id}/leads` | `/start/[caseId]/send` | P1 |
| Mine sager | `(tabs)/sager` | `GET /api/cases` | `/patient` | P1 |
| Sag | `/sag/[caseId]` | `GET /api/cases/{id}`, `GET /api/cases/{id}/leads`, `POST /api/leads/{id}/withdraw`, `POST /api/cases/{id}/close` | `/patient/sag/[caseId]` | P1: leads med status, klinikkens kommentar og pris, "Book tid". P2: "Træk tilbage", "Luk sag" (`CLOSE_CASE_CONSEQUENCE`), "Kontakt flere klinikker" |
| Beskeder | `/sag/[caseId]/beskeder/[leadId]` | `GET/POST /api/leads/{id}/messages` | beskedtråden på sagen | P2 |
| Book tid | `/sag/[caseId]/book/[leadId]` | `GET /api/leads/{id}/availability`, `POST /api/leads/{id}/booking`, `GET /api/patients/me` | `/patient/sag/[caseId]/book/[leadId]` | P1 |
| Bookinger | `/bookinger` (fra Mine sager) | `GET /api/bookings`, `POST /api/bookings/{id}/cancel` | `/patient/bookinger` | P1: liste. P2: aflys |
| Anmeld | `/anmeld/[bookingId]`, `/anmeldelser` | `GET /api/reviews/eligible`, `POST /api/reviews`, `GET /api/reviews/mine` | `/patient/anmeld/[bookingId]`, `/patient/anmeldelser` | P1: skriv anmeldelse fra en gennemført booking. P2: mine anmeldelser |
| Akut | `/akut` | `GET /api/services`, `GET /api/clinics?emergency=true…`, `GET /api/clinics/{id}/availability`, login/signup, `POST /api/consents`, `POST /api/emergency-leads` | `/akut` | P1: samme tre trin som 6.1, teksterne fra `lib/leads/constants/emergency.ts`; `tel:`-links til 112 og 1813 |
| Konto | `(tabs)/konto` | `GET/PATCH /api/patients/me`, `POST /api/auth/logout` | `/patient/konto` | P1: profil og log ud. P2: samtykker med tilbagetrækning (`GET /api/consents`, `POST /api/consents/{id}/withdraw`), slet konto (`DELETE /api/patients/me`, `deleteAccountSchema`). Efter: dataeksport som fil |

Reglerne fra weben gælder uændret i appen: AI'ens foreløbige vurdering vises altid med mærkatet, akut-blokken vises uafhængigt af AI'en, priser vises kun fra klinikkernes prislister, rækkefølgen er serverens, og kontaktoplysninger sendes kun ved booking. Faste tekster og labels hentes fra `lib/constants/` (fx `CONSENT_TEXTS`, `LEAD_STATUS_LABEL`, `CASE_TIMEFRAME_LABEL`, `EMERGENCY_REFERRAL_TEXT`, `CHAT_NOT_SHARED_TEXT`); appen skriver ikke sine egne versioner af dem.

### 13.5 Billeder, kort, position, links og notifikationer

- **Billeder:** tilføjes fra en knap ved chattens inputfelt (7.9). Billedsamtykket (`image_upload`, gældende version) gives i et samtykkekort i chatten lige før første valg, som på weben (9.4). `expo-image-picker` (kamera og bibliotek; danske tilladelsestekster i `app.json`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`). Før upload nedskaleres billedet med `expo-image-manipulator` til længste side `MAX_IMAGE_DIMENSION` og JPEG under `MAX_IMAGE_UPLOAD_BYTES` (`lib/common/constants/limits.ts`; lavere kvalitet i trin, ellers fejlteksten `FILE_TOO_LARGE`) i `src/utils/prepare-image.ts`. Upload som multipart med feltet `file` til `POST /api/cases/{id}/images` (uændret route; serveren genkoder og fjerner EXIF). Routen kræver `content-length` (411 `LENGTH_REQUIRED`). Målt med curl i 8.1: multipart med `Content-Length` giver 201. Om `fetch` med `FormData` fra iOS sender headeren, afgøres i appen (8.7); gør den ikke, bruges `FileSystem.uploadAsync` (multipart) fra `expo-file-system` i `src/api/client.ts`. Visning med de signerede URL'er fra `ImageDto.url`.
- **Kort:** `react-native-maps` med Apple Maps på iOS (ingen nøgle, virker i Expo Go). Markører for klinikker med position; samme klinikker og rækkefølge som listen. Ingen OpenStreetMap-fliser i appen.
- **Position:** `expo-location` (tilladelse "mens appen bruges", dansk tekst i `app.json`); koordinaterne afrundes som på weben og sendes kun med i kaldet, aldrig gemt (6.1). `roundPosition()` flyttes fra `platform/ui-utils/map.ts` til `lib/common/domain/position.ts` i 8.2, så weben og appen bruger samme regel.
- **Links:** Expo Router-skemaet `tandmatch://` til intern navigation. Eksterne links (klinikkens website, Trustpilot) åbnes med `expo-web-browser`. Universelle links og dybe links fra e-mail er [UDSKUDT].
- **Notifikationer:** ingen push i afleveringen [UDSKUDT]. Sag, bookinger og beskeder hentes igen, når skærmen får fokus, og beskedtråden poller hvert 15. sekund, mens den er åben (som weben).

### 13.6 Patientsiderne på weben

Fjernet 2026-10-22 (12.3 punkt 38 besluttet): `/start`, `/akut`, `/opret/patient` og `/patient/*` findes ikke længere på weben, og patientindgangene er fjernet fra forsiden, headeren og klinikoversigten. Patienter, der logger ind på weben, sendes til forsiden. Appen kopierer ikke kode fra webens UI; er en hjælper ren og nødvendig i appen, flyttes den til `lib/`.

### 13.7 Test

- **Serveren:** alle eksisterende suiter skal fortsat bestå: `test:rls`, `test:api`, `test:unit`, `npx vitest run tests/ai` og `test:e2e` (klinik-web og de pausede patientsider).
- **Nye API-tests (8.1)** i `features/identity/__tests__/api/mobile-auth.test.ts`: login, signup og anonym session med `X-TandMatch-Client: mobile` giver `session` og ingen `Set-Cookie`; uden headeren ingen tokens; `X-Terms-Token` erstatter cookien, et forfalsket eller forældet token giver 403 `TERMS_REQUIRED`; bearer på `GET /api/me`; ugyldigt bearer giver 401 (ikke cookie-fallback, også når en gyldig cookie er med); `POST /api/auth/refresh` giver nye tokens, og et genbrugt refresh-token afvises; logout tilbagekalder; isolation: patient A's bearer giver 404 på patient B's sag, og en klinik-bearer giver 403 på patientroutes; billedupload med bearer og multipart.
- **Appen:** Jest med `jest-expo` i `mobile/tests/` (`cd mobile && npm test`): API-klienten (headers, 401 → én fornyelse → nyt forsøg, samtidige 401 giver kun ét refresh-kald, `TERMS_REQUIRED`, fejltekster), billedforberedelsen (med mock af manipulatoren) og rene hjælpere. `npx tsc --noEmit` og `npx eslint .` i `mobile/` består.
- **Manuel gennemgang** (tester, 8.12) i iOS-simulatoren (iPhone 16 og iPhone SE) og på en iPhone i Expo Go efter en fast tjekliste over rejserne i 13.4. E2e med Maestro eller Detox er [UDSKUDT].

### 13.8 Demo og udviklingsmiljø

- **Server:** Next.js på brugerens Mac, `npm run build && npm start -- -H 0.0.0.0` (eller `npm run dev -- -H 0.0.0.0` under udvikling), så telefonen kan nå den på LAN. `.env.local` som i 2.3.
- **App:** `cd mobile && npx expo start`. iPhone: samme wifi som Mac'en, scan QR-koden med Kamera-appen, åbn i Expo Go, og tillad "Lokalt netværk". `EXPO_PUBLIC_API_URL=http://<Mac'ens LAN-IP>:3000` i `mobile/.env`. Simulator: `http://localhost:3000`, tryk `i` i Expo-terminalen.
- **Database:** iPhone-demo mod det fælles Supabase-projekt (billed-URL'er virker); udvikling i simulatoren kan bruge lokal Supabase (12.3 punkt 40).
- **Demodata:** `scripts/seed-demo.ts` som i arbejdsplanens 7.13; patient-login fra seed-loggen.
- **Forløb i demoen:** patienten i appen på iPhone, klinikken i browseren på Mac'en (`http://localhost:3000/klinik`): patient sender lead → klinik accepterer → patient booker → (seedet) anmeldelse; akutvejen live.
- **Før demoen:** opdatér Expo Go på iPhonen; tjek at Mac'ens firewall tillader port 3000 og 8081; prøvekørsler kan ramme IP-grænserne på 10 pr. time (login, signup, anonym session, billeder; 2.4), så vent en time eller ryd `rate_limits` i SQL-editoren (brugeren).
