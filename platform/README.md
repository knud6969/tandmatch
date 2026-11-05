# Platform (`platform/`)

Tværgående kode, som alle domæner bruger: middleware (`requireTerms`, `requireRole`, rate limit, områdevagt), databaseklienter og fejloversættelse (`db/`), basisklasser (`base/`), cron, billedbehandling, notifikationer (`notifications/`, afsnit 14) og klientsikre UI-hjælpere (`ui-utils/`). platform/ kender ingen domæner, bortset fra cron og session-/vilkårsvagten, som bruger `features/identity` og `features/booking` via deres `index.ts`. `platform/notifications/` kender heller ingen domæner: den læser kun outbox-tabellen og sender det, databasen har lagt i den.

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 2. Systemarkitektur

Lagene, mappestrukturen og grænserne mellem domænerne står i oversigten (`docs/architecture.md`, afsnit 2). Her ligger de tværgående detaljer.

### 2.1.1 Klasser i backend

**Hvad er klasser, og hvad er funktioner**

| Klasser | Funktioner |
|---|---|
| Repositories i repositories (`features/<domæne>/*Repository.ts`) (arver `BaseRepository`) | Middleware (`withApi`, `requireRole`, `guardArea` …), medmindre en klasse giver reelt genbrug |
| Services i `features/<domæne>/*Service.ts` | `platform/db/` (klientfabrikker, `mapDbError`) |
| Controllers i `features/<domæne>/*Controller.ts` | `route.ts`, `page.tsx`, `layout.tsx` (Next.js kræver funktioner) og React-komponenter (funktionelle) |
| | `lib/`: DTO-typer, zod-skemaer, konstanter og domæneregler (data og rene funktioner, ikke klasser) |
| | Rene hjælpefunktioner (fx `maskPii`, `findForbiddenTerms`, `formatPatientInput`) og `AI_RULES` (konstant) |

**`BaseRepository`** (`platform/base/baseRepository.ts`) samler det, der ellers gentages i hvert repository:
- `constructor(protected readonly db: SupabaseClient)`.
- Fejloversættelse: alle kald går gennem en beskyttet hjælper (fx `this.run(query)`/`this.rpc(name, args)`), der kalder `mapDbError` og kaster `ApiError`.
- Mapping `snake_case` → DTO: hvert repository angiver sin række-mapper (`protected toDto(row)`), og basisklassen bruger den på enkelte rækker og lister.
- "Find eller kast": `protected requireRow(row, { notFound, forbidden })` kaster 404 (eller 403, hvor 2.4 tillader det). Repositories bygger deres `require…`-metoder (`requireOwn(caseId)`) på den.
- Storage-repositories har en tilsvarende basisklasse (`platform/base/baseStorage.ts`) med bucket-navn, upload, sletning og signering.

**Afhængigheder gives i constructoren.** En klasse opretter ikke skjult sine afhængigheder inde i metoderne. Services får deres afhængigheder direkte i constructoren (`new AiChatService(openAiClient, AI_RULES)`, `new AccountDeletionService(adminClient)`); statiske fabriksmetoder (`forAdmin(...)`) bruges ikke.

**Controller-signaturer (besluttet):**
- Alle controllere med en bruger: `constructor(supabase: SupabaseClient, session: Session, deps: Partial<XDeps> = {})`. Det gælder også `ExportController` (eksporten læser med brugerens JWT, så RLS gælder). Repositories og services bygges i constructoren ud fra `deps` eller standardværdier.
- Undtagelser:
  - `CronController` kaldes af planlagte jobs uden session: `constructor(deps: Partial<CronDeps> = {})`. Den har ingen brugerklient og bruger kun service role-klienten (2.3 g).
  - Controllere for offentlige routes, som også kan kaldes uden login, tager `session: Session | null`: `ServicesController` og `ClinicDirectoryController`. De bruger kun brugerens klient (anon-nøglen, når der ikke er en session) og aldrig service role.
  - **Bygget (2026-11-04):** `NotificationController` (`platform/notifications/notificationController.ts`) sender det, der ligger i outboxen, og lægger påmindelser i den (14). Den kaldes af cron-routerne `/api/cron/notifications` og `/api/cron/booking-reminders` og efter svaret af routes med `withApi(handler, { notify: true })` (14.6). `constructor(deps: Partial<NotificationDeps> = {})` som `CronController`: ingen session, ingen brugerklient, kun service role-klienten (2.3 i).
  - Nye controllere uden session er ikke tilladt uden at blive beskrevet her.
- `deps` bruges kun til at erstatte afhængigheder i tests.

**Service role-klienten i controllere (besluttet):**
- `createSupabaseAdminClient()` kaldes **kun** fra `lazyAdminClient()` i `platform/db/admin.ts` (og fra scripts). Controllere og services kalder den aldrig direkte.
- En controller, der må bruge service role (2.3), har feltet `private readonly admin: () => SupabaseClient`, sat i constructoren til `deps.admin ?? lazyAdminClient()`. `lazyAdminClient()` returnerer en getter, der opretter klienten ved første kald og genbruger den inden for samme controller-instans (dvs. samme request).
- Klienten bruges kun ved at give `this.admin()` videre til et repository, en storage-klasse eller en service (`new CaseImageStorage(this.admin())`), og hvert kald har en kommentar med formålet fra 2.3 (fx `// 2.3 (c)`).
- Service role bruges aldrig til opslag på brugerens vegne. Data, der afgør, hvad der må ske (fx klinikkens id før sletning eller upload), hentes med brugerens klient (`ClinicsRepository.requireOwnId()`), og først derefter bruges `this.admin()` til filer, auth-bruger eller AI-skrivninger.
- Controllere, der ikke må bruge service role, har ikke feltet. Reviewer tjekker, at `createSupabaseAdminClient` kun findes i `platform/db/admin.ts` og `scripts/`.

**Rækker fra databasen valideres ikke med zod (besluttet):**
- Repositories stoler på databasens typer. Typerne genereres med `supabase gen types typescript --local` til `platform/db/database.types.ts`, og `BaseRepository` er generisk over tabellens rækketype. `toDto(row)` mapper typet række til DTO uden runtime-validering.
- **Undtagelse:** `jsonb`-kolonner (fx `cases.ai_summary`) har typen `Json` i de genererede typer og parses med zod-skemaet fra `lib/<domæne>/schemas/` eller `features/cases/ai/schemas.ts`, når de læses. Ugyldigt indhold behandles som `null` og logges uden indhold.
- zod bruges ellers kun på input til API'et (`lib/<domæne>/schemas/`) og på AI-output (7.4). `ProfilesRepository` følger samme mønster som de øvrige repositories.

**Ingen tilstand på tværs af requests.** Instanser oprettes pr. request og kasseres bagefter. Der må ikke være modul-singletons med en Supabase-klient, en session eller brugerdata, og ingen statiske felter med muterbar tilstand. Uforanderlig konfiguration (konstanter, `AI_RULES`, en OpenAI-klient uden brugerdata) må deles. **Undtagelse (2026-10-26):** tidspladsen for Nominatim-kald i `features/clinics/nominatimGeocodingService.ts` er et modul-felt (ét tal: hvornår næste kald tidligst må sendes), fordi brugspolitikken kræver højst 1 kald pr. sekund for hele serverprocessen. Den indeholder ingen brugerdata.

**Arv og genbrug:** arv kun fra basisklasserne i `platform/base/`. Ellers bruges komposition (en controller har repositories og services som felter).

**Klinikcontrollerne (besluttet): komposition, ingen fælles basisklasse.** `ClinicsController`, `ClinicDentistsController` og `PortfolioController` deler ejertjek, billedbehandling og service role-klient, men det er tre linjer hver, og en basisklasse ville koble dem. Mønstret:
- Ejertjek: `ClinicsRepository.requireOwnId(ownerId)` returnerer klinikkens id eller kaster 404. Én metode, ingen kopier i controllerne.
- Billeder: feltet `images = deps.images ?? new ImageProcessingService()`.
- Service role: feltet `admin = deps.admin ?? lazyAdminClient()` (ovenfor).
- Delt ren logik ligger i `lib/<domæne>/domain/` (fx `attachPortfolio()`), delt logik med I/O i en service.
Opstår der senere reel gentagelse i flere end tre controllere, beskrives en basisklasse her først (`platform/base/`).

**Fælles hjælpere i `BaseRepository`:** al databaseadgang går gennem de beskyttede hjælpere (`run`, `rpc`, `count`), så `mapDbError` altid bruges. Repositories laver ikke egne forespørgsler uden om dem. Typealiaser i et repository eksporteres kun, hvis de bruges uden for filen; delte typer udledes af zod-skemaerne i `lib/<domæne>/schemas/` (fx `NewClinicPrice = z.infer<typeof clinicPriceSchema>`).

Importreglerne og lagdelingen i 2.1 er uændrede, og ESLint håndhæver dem fortsat.

### 2.3 Nøgler, miljøvariabler og hosting

| Variabel | Hvor | Bemærkning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server (og evt. klient) | Offentlig |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server (og evt. klient) | Offentlig af design, beskyttet af RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | kun server, kun via `createSupabaseAdminClient()` | Må **kun** bruges til: (a) AI-skrivninger `append_assistant_message()` og `store_ai_summary()` (5.3), (b) `try_consume_anonymous_ai_call()` og `consume_rate_limit()` (5.3), (c) upload og sletning af billedfiler og `case_images`-rækker, også ved sletning af sag og tilbagetrækning af samtykke (9.2-9.4), samt upload af beskedbilleder og kaldet `send_message_with_images()` efter serverens deltager-, tråd- og samtykketjek (leads 10.12), (d) upload og sletning i den offentlige bucket `public-media` efter ejertjek (9.5), (e) signering af URL'er til `case-images` (også beskedbilleder), efter at stien er hentet gennem en RLS-beskyttet læsning (9.2; leads 10.12), (f) sletning af auth-bruger ved kontosletning, sletning af anonym session og sletning af den anonyme bruger efter overdragelse af kladden til en konto (`POST /api/session/claim`, identity 10.2), (g) de planlagte jobs: oprydning af anonyme sessioner (7.7) og `complete_due_bookings()` (5.3), (h) seed- og admin-scripts, herunder `admin_set_clinic_status()` og `scripts/create-admin.ts` (features/admin 6.4), (i) notifikationer: `claim_notifications()`, `complete_notification()`, `purge_notifications()`, `enqueue_booking_reminders()` og `enqueue_review_reminders()` (14.5, 14.8). Modtagerens e-mail og push-tokens hentes kun af `claim_notifications()` i databasen, aldrig med et separat opslag. Aldrig til at læse data på brugerens vegne |
| `OPENAI_API_KEY` | kun server | |
| `OPENAI_MODEL` | kun server | Model med vision + structured outputs. Falder tilbage til `DEFAULT_MODEL` i `features/cases/ai/openai.ts` |
| `GEOCODING_FAKE` | kun server, kun tests | `1` giver en falsk adresseopslagsklient uden netværkskald (`FakeGeocodingService`, clinics 4.3), men kun når `NODE_ENV !== 'production'`. Sættes af `tests/api/run.sh` og `tests/e2e/run.sh`. Ellers bruges OpenStreetMap Nominatim (ingen nøgle) |
| `CRON_SECRET` | kun server | Beskytter `/api/cron/cleanup-anonymous` og `/api/cron/complete-bookings`, og (bygget 2026-11-04) `/api/cron/notifications` og `/api/cron/booking-reminders` |
| `TERMS_COOKIE_SECRET` | kun server | HMAC-nøgle til vilkårs-cookien (2.5) |
| `RESEND_API_KEY` | kun server, kun `.env.local` | **Bygget (2026-11-04).** Nøgle til Resends HTTP API (14.6). Mangler den (eller `EMAIL_FROM`), bruges `ConsoleEmailService`, som kun logger type og modtager-id. Må aldrig have præfikset `NEXT_PUBLIC_` |
| `EMAIL_FROM` | kun server | **Bygget (2026-11-04).** Afsender, fx `TandMatch <notifikationer@tandmatch.dk>`. Domænet skal være verificeret i Resend (beslutninger 12.3 punkt 48) |
| `SITE_URL` | kun server | Findes (identity 10.2). **Fra 2026-11-04 også** basis for links i e-mails (`<SITE_URL>/klinik/lead/<id>`). Mangler den, bruges `http://localhost:3000` uden for produktion; i produktion springes e-mails over med fejlkoden `NO_SITE_URL` (14.5) |
| `EXPO_ACCESS_TOKEN` | kun server, valgfri | **Bygget (2026-11-04).** Kun hvis "Enhanced push security" slås til i Expo-kontoen; sendes som `Authorization: Bearer` til Expos push-API (14.6) |
| `NOTIFICATIONS_FAKE` | kun server, kun tests | **Bygget (2026-11-04).** `1` giver `FakeEmailService`, `FakePushService` og `FakeWebPushService` uden netværkskald, men kun når `NODE_ENV !== 'production'` (som `GEOCODING_FAKE`). Sættes af `tests/api/run.sh` og `tests/e2e/run.sh` |
| `PUSH_LOG_ONLY` | kun server | **Bygget (2026-11-04).** `1` giver `ConsolePushService` i stedet for Expo (udvikling uden telefon): logger kun type, modtager-id og antal enheder |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | offentlig (må stå i browseren) | **Bygget (2026-11-04).** VAPID-nøglens offentlige del (RFC 8292, 65 byte som base64url). Bruges af serveren til `k=` i `Authorization`-headeren og af klinik-weben til `pushManager.subscribe({ applicationServerKey })`. Laves med `node scripts/generate-vapid-keys.mjs` |
| `VAPID_PRIVATE_KEY` | kun server, kun `.env.local` | **Bygget (2026-11-04).** VAPID-nøglens private del (32 byte som base64url). Aldrig `NEXT_PUBLIC_`, aldrig i git eller logs. Mangler en af de tre VAPID-variabler, bruges `ConsoleWebPushService` |
| `VAPID_SUBJECT` | kun server | **Bygget (2026-11-04).** Kontaktadresse i VAPID-tokenet (`sub`), fx `mailto:support@tandmatch.dk` |

Patient-appen har kun én variabel, `EXPO_PUBLIC_API_URL` (API'ets base-URL, fx `http://192.168.1.20:3000` på LAN), i `mobile/.env` (committes ikke; `mobile/.env.example` committes). `EXPO_PUBLIC_*` bundles i appen og må derfor aldrig indeholde hemmeligheder; appen har hverken Supabase-nøgler eller OpenAI-nøgle (13.3).

Kun `.env.example` committes. Tests bruger `.env.test.local` med den lokale Supabase' URL og nøgler (`supabase status`); filen committes ikke.

**Hvorfor service role til AI-skrivninger:** patienten må ikke kunne skrive AI-svar eller opsummeringer selv. AI-skrivningerne sker via `security definer`-funktioner, som kun `service_role` må udføre. Serveren kalder dem efter validering.

Hosting: Supabase-projektet ligger i **EU-region**. **Demoen (besluttet, 12.3 punkt 14) [PROTOTYPE]:** Next.js-appen hostes ikke. Den kører lokalt på en bærbar som produktionsbuild (`npm run build && npm start`) mod det fælles Supabase-projekt med nøglerne i `.env.local` (sættes kun af brugeren). Derfor kører cron-jobbene (`/api/cron/*`) ikke; det er uden betydning for korrektheden, fordi bookingers status beregnes effektivt (4.2), og anonyme sessioner kan ryddes manuelt efter demoen. HSTS-headeren (2.4, `next.config.ts`) sendes kun i produktionsbuild og tjekkes med `curl -sI http://localhost:3000/`; browsere ignorerer HSTS over http, så den har ingen virkning lokalt. Hosting efter demoen (fx Vercel med EU-region for functions) er [UDSKUDT].

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
- Feltnavne i JSON: `camelCase`. Kolonner i databasen: `snake_case`. Mapping sker i repositories (`features/<domæne>/*Repository.ts`).
- Fejlformat for alle routes:
  ```ts
  type ApiError = { error: { code: string; message: string } }; // message på dansk, uden interne detaljer
  ```
- Statuskoder: 200, 201, 204, 400 (validering), 401 (ikke logget ind), 403 (forkert rolle/ejer/manglende samtykke), 404 (findes ikke **eller** ingen adgang; vi skelner ikke), 409 (forkert tilstand, fx lead ikke accepteret, tiden er taget), 413 (fil for stor), 429 (rate limit eller loft), 500, 503 (`AUTH_UNAVAILABLE`: Supabase Auth svarede midlertidigt ikke; klienten må prøve igen).
- **Midlertidige Auth-fejl er ikke "logget ud":** fejl, som `isTransientAuthError()` (`platform/db/authErrors.ts`) genkender (netværksfejl, `AuthRetryableFetchError`, 5xx), giver 503 `AUTH_UNAVAILABLE` og bliver aldrig til 401 eller en redirect til login. `proxy.ts` og områdevagterne behandler dem på samme måde.
- **Én auth-kontekst pr. request:** brugerens klient og bruger-id oprettes én gang (`createAuthContext()`, normalt via `requireTerms()`) og gives videre til rolletjek og controller, så sessionen kun verificeres og evt. fornyes ét sted pr. request (2.1, 12.1).
- Auth, to transporter, samme sessioner og samme RLS:
  - **Cookie (klinik-web og de pausede patientsider):** Supabase Auth med `@supabase/ssr`, session i `httpOnly`, `sameSite=lax`-cookies sat af serveren, `secure` i produktion (`AUTH_COOKIE_OPTIONS` i `platform/db/config.ts`). Browseren bruger aldrig Supabase-klienten selv. Uændret.
  - **Bearer (patient-appen):** appen sender `Authorization: Bearer <access token>`. `createAuthContext()` (via `createSupabaseRequestClient()` i `platform/db/supabase.ts`) ser headeren og opretter en Supabase-klient uden cookies (`persistSession: false`, `autoRefreshToken: false`, global header `Authorization`), verificerer tokenet med `auth.getUser(token)` og sætter `transport: "bearer"`. Bearer-transporten vælges, når requesten har en `Authorization`-header **eller** `X-TandMatch-Client: mobile` (appen før login: token-transport uden token, dvs. ingen session). **Ved bearer-transport læses og skrives auth-cookies ikke** (ingen blanding). Et ugyldigt eller udløbet token (eller en `Authorization`-header, der ikke er `Bearer <token>`) giver 401 `UNAUTHENTICATED` på alle routes, der bruger `createAuthContext()`, også selvom requesten har en gyldig cookie; appen fornyer så tokenet (13.3) og prøver én gang igen.
  - **Tokens udleveres kun til appen:** `POST /api/auth/login`, `POST /api/auth/signup`, `POST /api/session/anonymous` og `POST /api/auth/convert` returnerer `session: { accessToken, refreshToken, expiresAt }` i svaret, når requesten har headeren `X-TandMatch-Client: mobile` (og så sættes ingen auth-cookies). Uden headeren er svarene uændrede. `POST /api/auth/refresh` fornyer tokens (10.2). Alle svar med tokens har `Cache-Control: no-store`. Levetider: adgangstoken 3600 s (Supabase-standard); refresh-tokenet roterer ved hver fornyelse med 10 s reuse-interval (samme refresh-token kan genbruges inden for 10 s, fx ved samtidige kald); vilkårstokenet 12 måneder (2.5).
  - **Logout med bearer:** `POST /api/auth/logout` tilbagekalder tokenets session med `auth.admin.signOut(token, "local")` (refresh-tokenet bliver ugyldigt) og svarer 204, også ved et ugyldigt eller udløbet token; cookies røres ikke.
  - **CSRF og CORS:** bearer-kald bærer ingen automatiske legitimationsoplysninger og er derfor ikke sårbare for CSRF. Cookie-kald beskyttes som i dag af `sameSite=lax` og JSON-bodies. API'et sender **ingen CORS-headere**: native apps laver ikke CORS-tjek (og sender typisk ingen `Origin`), og en fremmed hjemmeside kan ikke sætte `Authorization` eller `X-TandMatch-Client` uden en preflight, som afvises. Der må ikke tilføjes `Access-Control-Allow-Origin` (heller ikke `*`). Expo for web understøttes ikke.
  - **IP-rate limit:** `clientIp()` i `platform/middleware/rateLimit.ts` bruger `x-forwarded-for`/`x-real-ip`. Når telefonen kalder `next start` direkte på LAN, er der ingen proxy; Next sætter selv `x-forwarded-for` til peer-IP'en (127.0.0.1 lokalt eller telefonens LAN-IP), så hver enhed får sin egen spand. Prøvekørsler fra samme enhed kan stadig ramme grænserne på 10 pr. time (demo-tjekliste, 13.8). En klient-sendt `x-forwarded-for` stoles på, når der ikke er en proxy foran, så grænsen kan omgås lokalt [PROTOTYPE] (12.1); bag Vercel overskriver platformen headeren.
- Ingen streaming. Alle svar, også AI-svar, returneres som ét samlet JSON-svar efter validering.
- **Sikkerhedsheadere** sættes for alle sider og routes i `next.config.ts` (`headers()`) (bygget i 1.9; den præcise CSP og evt. [PROTOTYPE]-kompromiser afgøres af security):
  - `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data: blob:` + Supabase-projektets URL (`public-media` og signerede URL'er fra `case-images`) (kortet henter vektorfliser med fetch, ingen eksterne billeder); `connect-src 'self' https://tiles.openfreemap.org` (kortets stil, fliser, skrifttyper og ikoner, clinics 6.6); `worker-src 'self'` (MapLibre GL's worker på egen oprindelse); browseren kalder ellers kun vores eget API, aldrig Supabase direkte; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. Scripts og styles tillader i prototypen `'unsafe-inline'` [PROTOTYPE, 0.1]; nonce-løsning senere.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (ældre browsere), `Permissions-Policy` uden kamera/mikrofon/geolokation, undtagen `geolocation=(self)`, når kortet bruger position (trin 2).
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` sættes kun i produktion (ikke lokalt over http). Endnu ikke tjekket i en produktionsbuild.
- Mangler gyldig vilkårs-accept, svarer API'et 403 `TERMS_REQUIRED` (2.5).

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

**Fra 2026-11-04** (tabellerne står i de nævnte README'er):

```
profiles 1─n push_tokens                              (patientens enheder; identity 4.3)
clinics  1─0..1 clinic_notification_settings          (klinikkens e-mail- og browser-valg; clinics 4.3)
profiles 1─n web_push_subscriptions                   (klinikejerens browsere til web push; 14.3)
notification_outbox n─0..1 leads / bookings / clinics / profiles   (kun service role; 14.3)
profiles 1─n user_notifications                       (klokken: id'er og tidspunkter, ingen tekst; 14.11)
patients 1─0..1 patient_notification_contacts         (patientens e-mail og nummer til notifikationer; identity 4.3, 14.12)
bookings 0..1─1 bookings via rescheduled_from_id      (flyttet tid; booking 4.3)
patients n─n clinics via favorite_clinics             (gemte klinikker; clinics 4.3)
profiles 1─n admin_actions                            (admins handlinger; features/admin 4.3)
```

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

-- Bygget (2026-11-04), migration 20261105000200 (14.3):
notification_channel = 'email' | 'push' | 'web_push'   -- email og web_push til klinikken, push (Expo) til patientens app
notification_status  = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
notification_type    = 'clinic_new_lead' | 'clinic_new_message' | 'clinic_booking_created' | 'clinic_booking_cancelled'
                     | 'clinic_booking_rescheduled' | 'clinic_booking_reminder'
                     | 'patient_lead_answered' | 'patient_new_message' | 'patient_booking_confirmed'
                     | 'patient_booking_cancelled' | 'patient_booking_reminder'
                       -- 'clinic_booking_rescheduled' oprettes allerede i PR A, så PR B (flyt tid) ikke skal tilføje en enum-værdi
```

Danske visningsnavne står i `lib/<domæne>/constants/<navn>.ts`.

**Livscyklusser** (håndhæves af triggers og funktionerne i 5.3, aldrig af klienten):
- `case_status`: `draft → submitted` (første lead sendt; indhold låses); `draft | submitted → closed` (patienten lukker med `close_case()`). Kun `draft` kan redigeres. En lukket sag kan ikke få nye leads; patienten kan altid starte en ny sag.
- `lead_status`: `sent → accepted | declined` (klinikken, `clinic_decide_lead()`) eller `sent → withdrawn` (patienten, `withdraw_lead()`); `accepted → booked` (booking oprettet); `booked → accepted` (booking aflyst). Systemovergange: `sent | accepted` (uden booking) `→ withdrawn` ved `close_case()` og ved tilbagetrækning af `health_data_sharing`; `sent | accepted → declined` med grunden `clinic_left`, når klinikken sletter sin konto. `declined` og `withdrawn` er endelige. **Aktive leads** = `sent`, `accepted`, `booked`. To lofter pr. sag: højst **3 aktive** leads og højst **10 leads i alt** uanset status. Patienten kan altid starte en ny sag.
- `booking_status`: `held` (kun akut: tiden er reserveret, mens leadet venter) `→ booked` (klinikken accepterer, før reservationen er udløbet) eller `→ cancelled` (klinikken afviser, patienten trækker leadet tilbage, eller reservationen udløber). En reservation udløber ved `hold_expires_at = least(created_at + 30 min, starts_at)`. `booked → cancelled` (patient eller klinik, før starttid; systemet for fremtidige bookinger, når klinikken sletter sin konto), `booked → no_show` (klinikken, fra starttid til 24 timer efter sluttid), ellers `booked → completed` automatisk, når 24-timers-fristen er udløbet. `completed`, `no_show` og `cancelled` er endelige.
- **Effektiv status:** en booking med `status = 'booked'` og `ends_at + interval '24 hours' <= now()` **er** gennemført, også før rækken er opdateret. Mellem sluttid og fristens udløb er den stadig `booked`. En `held`-booking med `hold_expires_at <= now()` er frigivet (`cancelled`). Alle policies og læsefunktioner bruger `effective_booking_status()` (5.2), så korrektheden ikke afhænger af et planlagt job. Jobbet `complete_due_bookings()` skriver blot den effektive status ned (5.3). Fristerne står som konstanter i `lib/booking/constants/bookings.ts` og som de samme tal i migrationen; de skal ændres begge steder samtidig (oversigt i 7.6).
- **Hele kvarterer:** en booking skal starte på minut 0, 15, 30 eller 45 med sekunder 0 (check constraint på `bookings.starts_at` i lokal tid og tjek i `assert_slot_bookable()`). `SLOT_STEP_MINUTES = 15`.

### 4.3 Tabeller

#### `consent_text_versions`, `postal_codes` og tællere
- `consent_text_versions` (`type`, `text_version`, `ai_disclosure`, `retired_at timestamptz null`): kendte samtykketekster. Offentligt læsbar. `retired_at` sat = pensioneret version (kontrakten ovenfor; kolonnen bygget i migration `20261028000500`).
- `postal_codes` (`postal_code text PK, city, lat, lng`): offentligt opslag. **Bygget i 7.15:** alle danske postnumre (uden stormodtagere) indsættes af migrationen `20261028000400_postal_codes_dk.sql` fra `supabase/data/postal-codes.csv`, så de også når det fælles projekt med `supabase db push`. Kilde: GeoNames' postnummerfil for Danmark (`https://download.geonames.org/export/zip/DK.zip`, CC BY 4.0; DAWA er nedlagt og svarer 410). Udvikleren henter og pakker filen ud manuelt; `scripts/generate-postal-codes.ts` læser `DK.txt` (tabulatorsepareret: postnummer i kolonne 2, by i kolonne 3, `lat`/`lng` i kolonne 10-11) og skriver CSV og migration med kilde, licens, kildeangivelse og hentedato i hovedet; koordinaterne afrundes til 4 decimaler. Kildeangivelsen "Postnumre og koordinater: GeoNames (CC BY 4.0)" vises også på `/om-os`. Ingen netværkskald ved runtime. Indsættelsen er idempotent (`on conflict (postal_code) do update set city, lat, lng`), så GeoNames-værdierne også erstatter de 21 omtrentlige rækker i det fælles projekt; `seed.sql` indsætter derefter ikke postnumre. Klinikkernes egne `lat`/`lng` ændres ikke af migrationen (12.3 punkt 13).
- `ai_limits`, `ai_usage_daily`, `ai_patient_usage_daily`, `ai_anon_user_usage_daily`, `rate_limits`: ingen brugeradgang; kun funktioner og service role (7.6). Indhold: lofter som nøgle/værdi (bl.a. `anon_daily_ai_calls`, `anon_user_daily_ai_calls`, `chat_messages_per_patient_day`), daglig tæller for alle anonyme AI-kald (ingen persondata), AI-kald pr. anonym bruger pr. døgn, udkast pr. patient pr. døgn, forsøg pr. bucket og IP-hash.

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
| `clinics` | `name`, `description`, `address`, `postal_code`, `city`, `phone`, `email`, `website`, `trustpilot_url`, `trustpilot_score`, `trustpilot_review_count`. `lat`/`lng` sættes af `clinics_guard()` til postnummerets midtpunkt (ved signup af `handle_new_user()`) og derefter af serveren via `set_clinic_location()` ud fra adressen (clinics 4.3), og `logo_path` skrives af serveren med service role efter upload (9.5) |
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
is_admin()                            -> boolean
is_permanent_user()                   -> boolean     -- JWT-claim is_anonymous = false
has_active_consent(type consent_type) -> boolean     -- seneste række af typen er ikke trukket tilbage og har en
                                                     -- ikke-pensioneret tekstversion (4.3; versionsdelen fra 20261028000500)
auth_clinic_id()                      -> uuid        -- clinics.id hvor owner_id = auth.uid(), ellers null (undtagelse, 5.1 regel 4)
is_clinic_owner(clinic_id)            -> boolean
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
is_allowed_consent_text(type, version) -> boolean   -- versionen findes for typen og er ikke pensioneret (fra 20261028000500)
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
| `send_leads(case_id, clinic_ids uuid[], requested_service_id default null, requested_starts_at default null, contact_name default null, contact_phone default null)` | patient (permanent) | Tjekker ejer, `is_permanent_user()`, godkendt opsummering, mindst én bekræftet ydelse, `preferred_timeframe` sat (ikke ved akut), aktivt `health_data_sharing` via `has_active_consent()` (fra migration `20261028000500` kun med en ikke-pensioneret tekstversion, dvs. det gældende samtykke, 4.3; funktionen selv ændres ikke), at alle klinikker er `verified`, at sagen ikke allerede har været sendt til klinikken, at **aktive** leads + nye ≤ 3 (ellers `LEAD_LIMIT`) og at **alle** leads på sagen + nye ≤ 10 (ellers `LEAD_TOTAL_LIMIT`). `requested_*` og `contact_*` kun ved én klinik og en akutydelse: så kaldes `release_expired_holds()`, tiden tjekkes som i `book_slot()`, og der oprettes i samme transaktion en `held`-booking med kontaktfelterne og `hold_expires_at = least(now() + 30 min, starts_at)` (overlap → 409 `SLOT_TAKEN`). Indsætter leads med `distance_km` og listepris-snapshot, sætter sagen `submitted` (første gang), `sharing_consent_id`, `submitted_at`, og lukker AI-samtalen. Returnerer kun antal oprettede leads |
| Trigger `leads_clinic_guard()` | BEFORE INSERT på `leads` (ikke en RPC) | Afviser et lead til en `removed` klinik (forsvar i dybden ud over `send_leads()`, som kun accepterer `verified`) |
| Trigger `leads_daily_limit()` | BEFORE INSERT på `leads` (ikke en RPC) | Højst 15 leads pr. patient på rullende 24 timer på tværs af sager og status (`LEAD_DAILY_LIMIT`, 429); advisory-lås pr. patient (7.6, migration `20261022000100`) |
| `patient_lead_clinics(p_case_id default null)` | patient | Navn, by, logo og `removed` for klinikker på egne leads (også `removed`, så uden logo). Ingen kontaktoplysninger, CVR eller adresse (10.9) |
| `clinic_decide_lead(lead_id, decision, comment, quoted_min, quoted_max, decline_reason, decline_note)` | klinik (verificeret ejer af leadets klinik) | Kun fra `sent`. `accept`: sætter `accepted`, kommentar og evt. pris; kalder først `release_expired_holds()`. Har leadet en `held`-booking, der ikke er udløbet (`hold_expires_at > now()`), bliver den `booked`, og leadet `booked`. Er reservationen udløbet, accepteres leadet alligevel (`accepted`) uden booking, og patienten booker selv en ledig tid via `book_slot()` (evt. den samme, hvis den stadig er ledig). `decline`: kræver `decline_reason` (ikke `clinic_left`, som kun systemet sætter); en `held`-booking sættes `cancelled` (`cancelled_by = 'clinic'`), så tiden frigives. Sætter `responded_at` |
| `close_case(p_case_id)` | patient (+anonym for kladde; ejer) | Fra `draft` eller `submitted`. Sætter `closed` og `closed_at`. Alle sagens leads med status `sent`, og `accepted` uden aktiv booking, sættes til `withdrawn` (`withdrawn_at = now()`), og deres `held`-reservationer frigives (`cancelled`, `cancelled_by = 'patient'`). Leads med `booked` og deres bookinger består. Lukker en evt. aktiv AI-samtale. Idempotent på en lukket sag |
| `set_clinic_service_groups(p_group_ids uuid[])` | klinik (ejer, permanent) | Erstatter klinikkens valgte kategorier i én transaktion. Kun aktive kategorier. Sletter klinikkens priser for behandlinger i kategorier, der fravælges. Returnerer de valgte kategori-id'er |
| `replace_clinic_prices(p_prices jsonb)` | klinik (ejer, permanent) | Erstatter hele prislisten i én transaktion (slet + indsæt). Validerer valgt kategori, aktiv behandling, pris- og varighedsgrænser og højst 100 rækker. En tom liste sletter alle priser |
| `replace_opening_hours(p_hours jsonb)` | klinik (ejer, permanent) | Erstatter alle åbningsvinduer i én transaktion. Højst 42 vinduer; overlap afvises af triggeren, og så rulles alt tilbage. En tom liste sletter alle vinduer |
| `set_clinic_location(p_lat, p_lng)` | klinik (ejer, permanent) | Sætter `lat`/`lng` på den kaldendes egen klinik (`owner_id = auth.uid()`; ingen klinik-id som parameter). Afviser punkter uden for Danmark (`lat` 54,4-57,9, `lng` 7,9-15,3) og ikke-endelige tal med `22023`, en anonym bruger med `42501`, og en bruger uden klinik eller en `removed` klinik med `P0002`/`CLINIC_REMOVED`. Kaldes kun af serveren efter et adresseopslag (clinics 4.3 "Placering ud fra adressen"); en klinik, der kalder den direkte, kan kun flytte sin egen markør inden for Danmark, hvilket svarer til at ændre sin adresse. Returnerer intet. Migration `20261104000100` |
| `is_cvr_claimed(p_cvr)` | `anon` og `authenticated` (signup-routen, før signup) | `true`, hvis en klinik med CVR'et har en ejer. Returnerer kun boolean (5.1 regel 4); afslører ikke andet. Rate-limit som signup |
| `withdraw_lead(lead_id)` | patient (permanent, ejer af sagen) | Kun fra `sent`. Sætter `withdrawn` og `withdrawn_at`; en `held`-booking sættes `cancelled` (`cancelled_by = 'patient'`). Pladsen i loftet på 3 aktive bliver fri (leadet tæller stadig i loftet på 10). Klinikken mister adgangen til sagens indhold og beskedtråden (5.7) |
| `clinic_mark_lead_seen(lead_id)` | klinik (ejer) | Sætter `seen_at`, hvis tom |
| `clinic_lead_status(p_lead_id)` | klinik (verificeret ejer, `sent_at >= owner_since`) | Returnerer leadets `lead_status` eller null (fremmed lead, ikke-verificeret klinik eller lead fra før `owner_since`). Erstatter klinikkens direkte læsning af `leads` (security trin 5, H1; migration `20261024000100`) |
| `clinic_lead_messages(p_lead_id)` | klinik (verificeret ejer; `is_lead_participant`) | Læsefunktion: trådens beskeder som `id`, `body`, `created_at`, `read_at`, `from_me`. Aldrig `sender_id` |
| `clinic_lead_message_images(p_lead_id)` | klinik (verificeret ejer; `is_my_clinic_lead`, ikke `withdrawn`) | Læsefunktion: trådens billeder som `id`, `message_id`, `position`, `storage_path`, `width`, `height`. Migration `20261103000100` (leads 10.12) |
| `send_message_with_images(p_user_id, p_lead_id, p_message_id, p_body, p_images)` | **kun service role** (serveren, med `p_user_id` fra den verificerede session, efter at filerne er uploadet) | Én transaktion: tjekker selv deltager (patient på sagen eller ejer af den verificerede klinik, lead efter `owner_since`, ikke `withdrawn`), permanent konto, åben tråd, 1-3 billeder, tekst højst 2000 tegn, døgnlofterne (200 beskeder, 30 billeder pr. afsender) og for patienten det gældende `image_upload`-samtykke; indsætter beskeden og `message_images`-rækkerne med stien `messages/{lead_id}/{id}.jpg`. Returnerer `created_at`. Migration `20261103000100` (leads 10.12) |
| `clinic_mark_messages_read(p_lead_id)` | klinik (verificeret ejer; `is_lead_participant`) | Sætter `read_at = now()` på patientens ulæste beskeder i tråden |
| `book_slot(lead_id, service_id, starts_at, contact_name, contact_phone)` | patient (permanent, ejer af sagen) | Leadet skal være `accepted` uden aktiv booking; ydelsen skal være bekræftet på sagen (eller leadets akutydelse). Beregner varighed (`service_duration_min()`) og `ends_at` og kalder `assert_slot_bookable()` (helt kvarter, åbningsvindue, akutvindue kun for akutydelser, blokeringer, varsel og horisont, 6.7). Sætter `contact_email` fra `auth.users`, gemmer telefon på `patients`. Kalder `release_expired_holds()` og indsætter derefter bookingen; overlap afvises af udelukkelsen (→ 409 `SLOT_TAKEN`). Afviser med `BOOKING_LIMIT`, hvis leadet allerede har 5 bookinger i alt (migration `20261027000100`). Bookinger, som **klinikken** har aflyst (`cancelled_by = 'clinic'`), tæller ikke med, så en klinik ikke kan bruge patientens loft op; patientens egne aflysninger, udløbne reservationer (`cancelled_by = null`), udeblivelser og gennemførte tæller (migration `20261028000100`, security kompromis 20). Telefonen tjekkes med `is_valid_phone()` (`INVALID_CONTACT`; samme migration). Sætter leadet `booked` |
| `is_valid_phone(p_phone text)` | intern (`immutable`, `search_path = ''`; bruges i check constraints og funktioner) | `true`, når teksten matcher `^[+0-9 ()-]{6,20}$` og har mindst 8 cifre (samme regel som `phoneSchema`, `MIN_PHONE_DIGITS`). (bygget i 7.1) |
| `send_emergency_lead(p_clinic_id, p_service_id, p_starts_at, p_description, p_contact_name, p_contact_phone, p_postal_code default null)` | patient (permanent) | Akutvejen i **én transaktion** (10.11): tjekker `is_permanent_user()`, at ydelsen er aktiv og har typen `emergency`, beskrivelsen (10-1000 tegn), navnet (2-100 tegn) og telefonen (`is_valid_phone()`, ellers `INVALID_CONTACT`) og evt. postnummeret (skal findes i `postal_codes`); opretter sagen (`is_emergency = true`, `postal_code` = input eller patientens, `preferred_timeframe = null`), bekræfter ydelsen i `case_services` (`suggested_by_ai = false`), sætter `summary_text = description`, `summary_approved_at = now()`, `summary_ai_assisted = false` (via `tm.system`), og kalder derefter `send_leads(case, [clinic], service, starts_at, name, phone)`, som tjekker `health_data_sharing`, verificeret klinik, lofter og tid og reserverer tiden (`held`). Fejler et led (fx `SLOT_TAKEN`), rulles alt tilbage, så der ikke ligger en halv akutsag. Returnerer `case_id` og `lead_id`. Ingen AI. Kun `authenticated`. (bygget i 7.3, migration `20261028000300`) |
| `cancel_booking(booking_id)` | patient (ejer) eller klinik (verificeret ejer, lead sendt efter `owner_since`) | Kun `booked` og før `starts_at`. Sætter `cancelled`, `cancelled_by`, `cancelled_at`; leadet tilbage til `accepted` |
| `mark_booking_no_show(booking_id)` | klinik (verificeret ejer, lead sendt efter `owner_since`) | Kun effektiv status `booked` og `starts_at <= now() < ends_at + interval '24 hours'`. Sætter `no_show`, `no_show_at`. Efter fristen er bookingen gennemført og kan ikke ændres (409 `NO_SHOW_WINDOW_CLOSED`) |
| `patient_bookings(p_booking_id default null)` | patient (egne bookinger) | Læsefunktion (migration `20261026000100`): `booking_id`, `lead_id`, `clinic_id`, `clinic_name`, `clinic_address`, `clinic_city` (patienten har ingen SELECT på `clinics`, og en fjernet klinik skal kunne vises), `service_id`, `service_name`, `starts_at`, `ends_at`, effektiv `status` (4.2), `hold_expires_at` (kun `held`), `reviewed` (der findes en anmeldelse) og `created_at`. Nyeste starttid først. Giver intet for andres bookinger |
| `release_expired_holds(clinic_id)` | intern (kaldes kun af funktionerne ovenfor; ingen EXECUTE for `anon`/`authenticated`) | Sætter `held` med `hold_expires_at <= now()` for klinikken til `cancelled` |
| `complete_due_bookings()` | **kun service role** (planlagt job, `/api/cron/complete-bookings`, hver time) | Sætter `completed`, `completed_at = ends_at + 24 t` for `booked` med `ends_at + interval '24 hours' <= now()`, og `cancelled` for alle `held` med `hold_expires_at <= now()`. Ren oprydning; reglerne bygger på `effective_booking_status()` og `release_expired_holds()`, så intet afhænger af jobbet. Bruger ikke `auth.uid()` |
| `withdraw_consent(consent_id)`, `confirm_consent_cleanup(consent_id)` | patient (+anonym) | Som før, men billeder hænger på sager. **Tilbagetrækning gælder typen** (bygget, migration `20261028000500`, `create or replace` med uændret signatur, returtype og grants; security 7.11 M2): den valgte række og alle andre aktive samtykker af samme type for patienten får samme `withdrawn_at` i samme transaktion, uanset tekstversion; `pending_storage_paths` og `cleanup_done` sættes på den valgte række som i dag, de øvrige får `cleanup_done = true`. Konsekvensen udløses altid (ingen undtagelse for "et andet aktivt samtykke"). Tilbagetrækning af `image_upload` sletter rækkerne i `case_images` (også på sendte sager) og patientens rækker i `message_images` (fra migration `20261103000100`; stierne kommer med i `deleted_image_paths`), og billederne forsvinder dermed for klinikkerne. Tilbagetrækning af `health_data_sharing` sætter alle patientens leads med status `sent`, og `accepted` uden aktiv booking, til `withdrawn` (klinikken mister adgangen, 5.7) og frigiver deres `held`-reservationer (`withdraw_open_leads()`); `withdrawn_leads` er antallet. `booked` bookinger består; patienten kan selv aflyse dem (`cancel_booking()`). Nye leads kræver nyt, gældende samtykke. Et genkald på en allerede trukket række opfører sig som i dag (`ALREADY_WITHDRAWN` eller genforsøg af oprydningen) |
| Trigger `clinics_after_owner_removed()` | på `clinics`, når `owner_id` går fra en værdi til `null` (ejerens konto slettes; ikke en RPC) | **Altid først:** alle klinikkens leads med `sent` eller `accepted` sættes til `declined` med `decline_reason = 'clinic_left'` og `responded_at = now()`; `held`-reservationer frigives (`cancelled`, `cancelled_by = 'clinic'`); fremtidige `booked` bookinger (`starts_at > now()`) aflyses (`cancelled_by = 'clinic'`), og deres leads sættes til `declined` med `clinic_left`. Selve klinikrækken (status og felter) er allerede ændret af `clinics_guard()` i samme UPDATE (4.3); denne AFTER-trigger rydder **rækker i andre tabeller**:<br>**(a) importeret klinik** (`import_source is not null`, nu `imported`): sletter prisliste (`clinic_prices`), valgte kategorier (`clinic_service_groups`), blokerede tider (`clinic_time_blocks`) og tandlæger (`clinic_dentists`, og dermed `portfolio_items` via cascade). Åbningstiderne bevares som offentlige grunddata.<br>**(b) selvoprettet klinik** (`import_source is null`, nu `removed`): sletter det samme og desuden åbningstiderne (`clinic_opening_hours`), fordi klinikken aldrig vises igen. Rækken slettes **ikke**, og der bruges ingen cascade: patienternes leads, beskeder, bookinger og anmeldelser bevares, og patienten ser klinikkens navn og "Klinikken er ikke længere på TandMatch". Anmeldelserne er ikke offentlige (kun verificerede klinikker vises), men patienten ser sin egen. `removed` er endelig, og samme CVR opretter en ny klinik ved signup (CVR er nulstillet; `handle_new_user()`/`is_cvr_claimed()` knytter kun til `imported` uden ejer).<br>I begge tilfælde består afholdte bookinger og anmeldelser. Oprydningen sker i triggerne (besluttet), så den er atomar og også virker, når en konto slettes uden om API'et; service role bruges kun til filer og auth-bruger (2.3). Filerne i `public-media` slettes af `DELETE /api/clinics/me` (10.8), før auth-brugeren slettes |
| `approve_summary(case_id, summary_text, ai_assisted boolean default null)` | patient (+anonym, ejer) | Eneste vej til `summary_text`. Kun `draft`, max 1500. Sætter `summary_ai_assisted` ud fra parameteren (10.5); uden AI-udkast tvinges den til `false` (migration `20261019000200`) |
| `reserve_chat_turn(p_user_id, p_conversation_id, p_content)` | **kun service role** (serveren, med `p_user_id` fra den verificerede session, efter IP-grænsen og **før** modelkaldet; ingen EXECUTE for `authenticated`) | Én transaktion: advisory-lås, låser samtalen, tjekker selv ejer (`p_user_id`), kladde og aktivt `ai_processing`, tæller loftet pr. samtale (`ai_limits.chat_messages_per_conversation`, 30) og beskedlængden (`ai_limits.chat_message_max_chars`), døgnloftet pr. patient (`ai_limits.chat_messages_per_patient_day`, talt pr. UTC-dag i `ai_patient_usage_daily.chat_messages`, som ikke slettes med sagen), for anonyme loftet pr. anonym bruger (`ai_limits.anon_user_daily_ai_calls` = 40, tabel `ai_anon_user_usage_daily`, intern `consume_anonymous_ai_call()`) og det globale anonyme loft, og indsætter brugerbeskeden (allerede PII-maskeret). Eneste vej til at indsætte en brugerbesked i `ai_messages` (5.4). Fejler et led, rulles alt tilbage (migrationer `20261019000100` og `20261020000100`) |
| `store_ai_summary(p_user_id, case_id, …)` | **kun service role** | Skriver det validerede udkast. Tjekker internt, at sagen tilhører `p_user_id` og er `draft` |
| `append_assistant_message(p_user_id, conversation_id, …)` | **kun service role** | Indsætter assistentbesked (svar, foreløbig vurdering, foreslåede ydelser, akut, out-of-scope, blocked). Tjekker ejer, kladde og aktivt `ai_processing`; en lukket samtale accepteres kun ved loftet på 30, og kun når den seneste besked er patientens (migrationer `20261018000100` og `20261019000100`). Afviser ydelses-id'er, der ikke er aktive i kataloget |
| `consume_summary_generation(p_user_id, p_case_id)` | **kun service role** (serveren, med `p_user_id` fra den verificerede session, efter IP-grænsen; ingen EXECUTE for `authenticated`; migration `20261020000100`) | Tjekker selv ejer, kladde og aktivt `ai_processing`. Én transaktion: sagens loft (5), patientens døgnloft (20), for anonyme brugerens eget døgnloft (`anon_user_daily_ai_calls`, 429 `RATE_LIMITED`) og det globale loft. Øger tællerne |
| `try_consume_anonymous_ai_call(p_user_id)` | **kun service role** | Atomisk: tjekker at `p_user_id` er anonym, øger dagens tæller og returnerer `true` under loftet `ai_limits.anon_daily_ai_calls` (300). Bruger **ikke** `auth.uid()` (5.1 regel 8) |
| `consume_rate_limit(key, limit)` | **kun service role** | Uændret. IP kun som hash |
| `touch_last_active()` | `authenticated` | Uændret |
| `moderate(kind, id, status, reason)` | admin | Findes ikke; erstattet af `admin_moderate()` (nedenfor og features/admin 5.3). Seed-anmeldelser er forhåndsgodkendte |
| `admin_set_clinic_status(clinic_id, status)` | **kun service role** (seed og admin-scripts) [PROTOTYPE] | Sætter `status` og `verified_at` via et transaktionsflag, som `clinics_guard()` kun accepterer fra denne funktion |
| `clinic_leads(p_status lead_status default null)`, `clinic_lead_detail(lead_id)`, `clinic_lead_images(lead_id)`, `clinic_bookings(from, to)`, `clinic_booking(booking_id)`, `clinic_reviews()` | klinik | Læsefunktioner (5.7). `p_status = null` giver alle |
| `public_clinics(p_service_ids uuid[], p_clinic_ids uuid[])` | alle, også `anon` | Kun synlige klinikker (5.1 regel 11): basisdata (inkl. Trustpilot) for `imported` uden ejer og for `verified`, plus fulde felter (logo, priser for de angivne ydelser, `has_emergency_hours`) for `verified`. `registered` returneres aldrig. Ingen `owner_id`, ingen `cvr` |
| `public_clinic_profile(clinic_id)` | alle | Som ovenfor for én klinik, plus beskrivelse, hele prislisten, åbningstider, tandlæger og portefølje (kun `verified`) |
| `public_busy_intervals(clinic_ids uuid[], from, to)` | alle | Optagede tidsrum (ikke-udløbne `held`- og `booked`-bookinger samt blokeringer) for verificerede klinikker. Kun `starts_at`/`ends_at`, ingen id'er, ingen typer. Grundlag for ledige tider (6.7) |
| `public_reviews(clinic_id)`, `public_clinic_review_stats_many(clinic_ids)` | alle | Godkendte anmeldelser og godkendte svar; statistik (4.3, 8.3). Kun for verificerede klinikker |
| `register_web_push_subscription(p_endpoint, p_p256dh, p_auth)` | klinik (permanent) | Clinics 10.19. Registrerer klinikejerens browser til web push (14.3): kræver `is_permanent_user()` og `profiles.role = 'clinic'` (ellers `42501`), et `https`-endpoint og nøgler af den rigtige længde (ellers `22023`), flytter et endpoint fra en anden bruger og beholder højst 10 abonnementer pr. bruger. Migration `20261105000200` |
| `register_push_token(p_token, p_platform)` | patient (permanent) | Identity 4.3 `push_tokens`. Flytter et token fra en anden bruger til den kaldende (samme telefon, ny konto), opdaterer `last_seen_at` og beholder højst 5 tokens pr. bruger. Migration `20261105000100` |
| Triggerne `notify_after_lead_change()`, `notify_after_message()`, `notify_after_booking_change()` | AFTER INSERT/UPDATE på `leads`, `messages`, `bookings` (ikke RPC'er) | Lægger rækker i `notification_outbox` i samme transaktion som handlingen (14.4). Fejl fanges (`exception when others` → `raise warning` uden indhold), så en notifikation aldrig ruller handlingen tilbage. Migration `20261105000200` |
| `claim_notifications(p_limit)`, `complete_notification(p_id, p_status, p_error_code, p_invalid_tokens)`, `purge_notifications()` | **kun service role** | Afsendelsen (14.5). `claim` returnerer også modtagerens e-mail, push-tokens eller browser-abonnementer (`to_email`, `push_tokens`, `web_push_subscriptions`) og klinik-/bruger-id til logning; ingen andre veje til dem. Migration `20261105000200` |
| `mark_notifications_read(p_ids uuid[] default null)` | klinik og patient (permanent) | Markerer egne notifikationer som læst (højst 100 id'er, ellers alle). Rører aldrig andres. Migration `20261108000100` (14.11) |
| `notification_inbox_add()`, nye versioner af `notification_enqueue()`, `enqueue_booking_reminders()`, `purge_notifications()`, `notify_after_booking_change()`, `claim_notifications()` | ingen EXECUTE for klientroller | Klokken og patientens e-mail og SMS (14.11, 14.12). Migrationerne `20261108000100` og `20261108000300` |
| `enqueue_review_reminders()` | **kun service role** (`/api/cron/booking-reminders`) | Påmindelse om anmeldelse dagen efter tiden (14.8) |
| `enqueue_booking_reminders()` | **kun service role** (`/api/cron/booking-reminders`) | Påmindelser dagen før (14.8). Idempotent via `dedup_key`. Bruger ikke `auth.uid()` |
| `reschedule_booking(p_booking_id, p_starts_at)` | patient (permanent, ejer) | Flyt tid i én transaktion (booking 10.16). Migration `20261106000100` |
| `is_public_clinic(p_clinic_id)` | policy-hjælper (`authenticated`) | `true` for `verified` og for `imported` uden ejer (samme regel som 5.1 regel 11). Returnerer kun boolean. Bruges af INSERT-policyen på `favorite_clinics` (clinics 4.3). Migration `20261106000200` |
| `clinic_stats(p_from, p_to)` | klinik (verificeret ejer) | Læsefunktion med tal for egen klinik (clinics 10.18). Migration `20261107000100` |
| `admin_change_clinic_status(p_clinic_id, p_status, p_reason)`, `admin_moderate(p_kind, p_id, p_status, p_reason)` | admin (`is_admin()` og permanent) | Features/admin 5.3. Migration `20261107000200` |

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
| message_images | Kun patienten direkte via `is_lead_patient(lead_id)` (kolonne-grant uden `consent_id`). **Klinikker har ingen SELECT**; de læser via `clinic_lead_message_images()` (5.7) | ingen for `authenticated`: kun `send_message_with_images()` (service role) | ingen | ingen (cascade fra `messages`/`leads`; `withdraw_consent()`) |
| messages | Kun patienten direkte: `sender_id = uid` eller sagens ejer via `is_case_owner`. **Klinikker har ingen SELECT**; de læser via `clinic_lead_messages()` (5.7). Kolonne-grant: `authenticated` kan læse `id`, `lead_id`, `sender_role`, `body`, `created_at` og `read_at`, men ikke `sender_id` (klinikejerens bruger-id; security trin 5, L1; migration `20261024000100`) | `sender_id = uid` og `is_permanent_user()` og `is_lead_participant(lead_id)` og `is_lead_thread_open(lead_id)` og ikke-tom `body` (fra migration `20261103000100`; beskeder med billeder og evt. tom tekst indsættes kun af `send_message_with_images()`) (`created_at`/`read_at` sættes af trigger, 5.1 regel 15) | patienten må sætte `read_at` på modtagne beskeder (`sender_role = 'clinic'`, også når afsenderen er slettet; kolonne-grant); klinikken via `clinic_mark_messages_read()`. `messages_before_insert()` er security definer og udleder `sender_role` (en afvigende værdi giver `SENDER_ROLE_MISMATCH`); `messages_before_update()` tillader kun, at `sender_id` bliver null (migration `20261023000100`) | ingen |
| bookings | `patient_id = uid`. Klinikker **ingen** direkte; kun via `clinic_bookings()`/`clinic_lead_detail()` | ingen (kun `book_slot`) | ingen (kun `cancel_booking`, `complete_booking`) | ingen |
| reviews | `patient_id = uid` eller `is_admin()`. Offentligt via `public_reviews()`, klinikken via `clinic_reviews()` | se 8.1 | ingen | ingen (moderation kun gennem `admin_moderate()`) |
| review_replies | `clinic_id = auth_clinic_id()` eller `is_admin()`. Offentligt via `public_reviews()` | `review_is_for_my_clinic(review_id)` og `review_is_approved(review_id)` og `clinic_id = auth_clinic_id()` | ingen | ingen |
| push_tokens | `user_id = uid` | **ingen** (kun `register_push_token()`) | ingen | `user_id = uid` |
| web_push_subscriptions | `user_id = uid` | **ingen** (kun `register_web_push_subscription()`) | ingen | `user_id = uid` |
| notification_outbox | **ingen** (kun service role og triggerne) | ingen | ingen | ingen |
| user_notifications | `user_id = uid` | **ingen** (kun triggerne) | ingen (kun `mark_notifications_read()`) | ingen (cascade og `purge_notifications()`) |
| patient_notification_contacts | `patient_id = uid` | `patient_id = uid` og `is_permanent_user()` | som insert (kolonne-grant: `patient_id`, `email`, `phone`) | `patient_id = uid`. Klinikker og admin har ingen adgang |
| clinic_notification_settings | `is_clinic_owner(clinic_id)` | `is_clinic_owner(clinic_id)` og `is_permanent_user()` | som insert (kolonne-grant: kun de otte `email_*`- og `web_push_*`-felter) | ingen |
| favorite_clinics | `patient_id = uid` | `patient_id = uid` og `is_permanent_user()` og `is_public_clinic(clinic_id)` (trigger: højst 200 pr. patient) | ingen | `patient_id = uid` |
| admin_actions | `is_admin()` | ingen (kun `admin_*`-funktionerne) | ingen | ingen |

Note: indtil migration `20261024000100` havde klinikker direkte SELECT på hele `leads`-rækken, også `case_id` og felterne på tilbagetrukne leads (security trin 5, H1). Policyen er nu `leads_select_case_owner`; alt, klinikken læser om et lead, går gennem security definer-funktioner, der skjuler `case_id` og indholdet af tilbagetrukne leads.

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
31. (Fil `30_quarter_check_and_hardening.sql`; vendt i 7.12a med migration `20261028000500`.) Tilbagetrækning af ét `health_data_sharing`-samtykke trækker alle patientens aktive samtykker af typen tilbage (også et ældre v0) og trækker `sent`- og ubookede `accepted`-leads tilbage; `withdrawn_leads` er antallet.
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
49. (Fil `48_booking_limit.sql`.) `book_slot()` afviser den 6. booking på samme lead med `BOOKING_LIMIT`, også når de tidligere er aflyst af patienten, udeblevet eller gennemført; loftet tæller ikke bookinger aflyst af klinikken (fem klinik-aflysninger blokerer ikke, fem patient-aflysninger gør); loftet er pr. lead (et andet lead hos samme klinik og en anden patients lead er upåvirket), og de afviste kald efterlader ingen booking; anonyme afvises stadig (`42501`) og en klinik får `NOT_FOUND` (migration `20261028000100`).
50. (Fil `49_phone_digits.sql`.) `is_valid_phone()` afviser fx `((((((`, `123 45` og `1234567` og accepterer `12345678` og `+45 12 34 56 78`; direkte insert/update med patientens JWT af `patients.phone` og et direkte kald af `book_slot()` med et telefonnummer under 8 cifre afvises; klinikkens `phone` med under 8 cifre afvises.
51. (Fil `50_send_emergency_lead.sql`.) `send_emergency_lead()` afviser anonym bruger, en ikke-akut ydelse, manglende `health_data_sharing`, ikke-verificeret klinik, en tid uden for akut- eller åbningsvindue og ugyldig telefon; ved `SLOT_TAKEN` (tiden er reserveret af en anden) findes hverken sag, ydelse eller lead bagefter; ved succes er sagen `submitted`, `is_emergency`, med godkendt opsummering, ét lead og en `held`-booking; klinikken ser leadet som akut uden kontaktfelter, før den accepterer.
52. (Bygget i 7.12a.) (Fil `51_retired_consent_versions.sql`.) Hver `consent_type` har præcis én række i `consent_text_versions` med `retired_at is null`; `health_data_sharing@v0-prototype` er pensioneret. En permanent patient kan ikke indsætte et samtykke til en pensioneret version med sin egen JWT (policy, `42501`). En patient, hvis seneste delingssamtykke er v0 (indsat som fixture med service role), afvises af både `send_leads()` og `send_emergency_lead()` (`CONSENT_REQUIRED`) og kan sende efter at have givet v1. En patient med både v0 og v1, der trækker v1 tilbage, har bagefter intet aktivt delingssamtykke, og leads er trukket tilbage. Et v0-samtykke kan stadig trækkes tilbage.
53. (Fil `57_message_images.sql`.) `message_images`: `authenticated` kan hverken indsætte, ændre eller slette rækker og kan ikke kalde `send_message_with_images()`; patienten ser kun billeder i egne tråde; klinik Y får intet fra `clinic_lead_message_images()` for X's lead; X får intet efter `withdrawn`; med service role afvises fremmed afsender, lukket tråd, flere end 3 billeder, tom besked uden billeder og patient uden gældende `image_upload`; klinikken kræver intet samtykke; tilbagetrækning af `image_upload` sletter patientens beskedbilleder (ikke klinikkens) og returnerer stierne; direkte indsættelse af en tom tekstbesked afvises.

**Fra 2026-11-04** (trin 11, `docs/arbejdsplan.md`; punkt 54-62 er bygget):

54. (Fil `59_push_tokens.sql`.) En patient ser og sletter kun egne `push_tokens`; `authenticated` kan ikke indsætte eller ændre direkte; `register_push_token()` afviser anonym, klinik og admin (`42501`) og et token, der ikke matcher mønsteret (`22023`); samme token registreret af patient B fjernes fra patient A; den 6. registrering sletter den ældste; sletning af kontoen sletter tokens (cascade).
55. (Fil `60_notification_outbox.sql`.) `anon` og `authenticated` (patient, klinik, admin) kan hverken læse, indsætte, ændre eller slette i `notification_outbox` og kan ikke kalde `claim_notifications()`, `complete_notification()`, `purge_notifications()` eller `enqueue_booking_reminders()`. Triggerne lægger præcis de rækker i outboxen, som 14.4 beskriver: nyt lead (også akut, med `holdExpiresAt`), patientbesked to gange inden for 15 minutter giver én række, klinikbesked, beslutning (accept og afvisning), `book_slot()`, aflysning af patienten og af klinikken, accept af akut-lead (`held → booked`) og sletning af klinikkonto. Ingen række ved `withdraw_lead()`, `close_case()` og en udløbet reservation. `payload` har kun nøglerne i 14.3 (ingen opsummering, ydelse, navn, telefon, e-mail eller beskedtekst). En slået-fra-indstilling giver ingen e-mailrække. `enqueue_booking_reminders()` kaldt to gange giver samme antal rækker. `claim_notifications()` giver ikke en e-mail for en klinik uden ejer, en ikke-verificeret klinik eller et lead fra før `owner_since`. En fejl i enqueue (fx simuleret med en ugyldig indstillingsrække) ruller ikke `book_slot()` tilbage.
56. (Fil `61_clinic_notification_settings.sql`.) Kun ejeren kan læse, indsætte og ændre klinikkens række; en anden klinik og en patient får 0 rækker; `authenticated` kan ikke ændre `clinic_id`; standardværdierne (web push-påmindelse slået fra, resten til).
57. (Fil `62_reschedule_booking.sql`, PR B.) `reschedule_booking()` kun for ejeren af en `booked` booking før starttid; afviser `held`, `cancelled`, en andens booking og samme tid; ved `SLOT_TAKEN` er den gamle booking stadig `booked` (atomisk); efter succes er den gamle `cancelled` (`cancelled_by = 'patient'`), den nye `booked` med `rescheduled_from_id`, leadet stadig `booked`, klinikken ser kontaktfelterne på den nye booking og ikke på den gamle, og outboxen har én `clinic_booking_rescheduled` og ingen `clinic_booking_cancelled`; `BOOKING_LIMIT` gælder.
58. (Fil `63_favorite_clinics.sql`, PR B.) En patient ser kun egne favoritter; anonym og klinik kan ikke indsætte; en `registered` eller `removed` klinik kan ikke gemmes; den 201. afvises; sletning af kontoen sletter favoritterne.
59. (Fil `64_clinic_stats.sql`, PR C.) `clinic_stats()` tæller kun egen kliniks leads og bookinger fra `owner_since`; klinik Y får aldrig X's tal; en ikke-verificeret klinik, en patient og `anon` afvises; et interval over 366 dage afvises.
61. (Fil `66_web_push_subscriptions.sql`, bygget i PR A; nummeret ligger efter PR C's filer, fordi 62-65 er reserveret.) `web_push_subscriptions`: kun ejeren læser og sletter egne rækker; `authenticated` kan ikke indsætte eller ændre direkte; `register_web_push_subscription()` afviser patient, anonym, anon og admin (`42501`), `http`-endpoints og forkerte nøgler (`22023`), flytter et endpoint mellem konti og beholder højst 10 abonnementer; sletning af kontoen sletter dem (cascade). Outboxen får `web_push`-rækker kun for klinikker, hvis ejer har et abonnement og har valgt typen; beskeder dæmpes pr. kanal; `claim_notifications()` returnerer kun den nuværende ejers abonnementer; `complete_notification()` sletter kun ejerens ugyldige endpoints.
62. (Fil `67_notification_inbox.sql`, 2026-11-05.) `user_notifications`: hver bruger ser kun egne rækker; patient, klinik og anonym kan ikke indsætte, ændre eller slette direkte; `mark_notifications_read()` rører kun egne rækker (fremmede id'er ændrer intet) og afviser mere end 100 id'er (`22023`) og `anon` (`42501`). Triggerne lægger præcis de rækker, 14.11 beskriver, også når klinikken har slået e-mail og web push fra; en ny klinikejer ser ikke den gamle ejers rækker; en besked giver kun én ulæst række pr. lead; en fejl i indbakken ruller ikke `book_slot()` tilbage. `patient_notification_contacts`: kun patienten ser og retter egen række, klinik, admin og anden patient får 0 rækker, ugyldigt nummer og ugyldig e-mail afvises, sletning af kontoen sletter rækken; ingen klinikfunktion (`clinic_lead_detail()`, `clinic_bookings()`) returnerer nummeret eller e-mailen. Outboxen giver e-mail og SMS til patienten kun for booket, flyttet, bekræftet, aflyst (begge veje), påmindelse og anmeldelsespåmindelse, aldrig for svar på henvendelse og beskeder, og ingen adresse eller nummer ligger i `payload`. `enqueue_review_reminders()` giver kun gennemførte besøg uden anmeldelse, ikke udeblivelse eller aflysning, og kun én gang.
60. (Fil `65_admin.sql`, PR C.) Patient, klinik og anonym kan ikke kalde `admin_change_clinic_status()` eller `admin_moderate()` (`42501`); admin kan; kun overgangene `registered ↔ verified` er tilladt; afvisning uden begrundelse afvises; hver handling skriver én række i `admin_actions`, som kun admin kan læse; admin kan stadig ikke læse `cases`, `leads`, `bookings`, `messages`, `notification_outbox` eller `push_tokens`.

API-tests (obligatoriske): vilkårs-gaten (403 `TERMS_REQUIRED`, forfalsket cookie afvises, ny version kræver ny accept) og "vilkårs-accept giver ikke samtykke" (403 `CONSENT_REQUIRED` ved upload/chat).

## 6. Sider og routes (App Router)

Status: bygget i trin 1 er `/opret/klinik`, `/klinik` (opsætningsoversigt; fra 5.3 også lead-indbakken, se 6.3), `/klinik/profil`, `/klinik/prisliste` (med kategorier, 1.9), `/klinik/aabningstider` og `/klinik/tandlaeger`, samt kernens sider (vilkår, login, `/opret`, `/opret/patient`). Bygget i trin 2 (`a3f8d47b`, `ea70980b`): `/`, informationssiderne, `/klinikker` og `/klinikker/[clinicId]`. Bygget i trin 3 (3.4): `/start` og `/start/[caseId]`. Bygget i trin 4: `/start/[caseId]/send`, `/patient` og `/patient/sag/[caseId]`. Bygget i trin 5 (5.3): lead-indbakken på `/klinik` og `/klinik/lead/[leadId]`. Bygget i trin 6: `/patient/sag/[caseId]/book/[leadId]`, `/patient/bookinger`, `/patient/anmeldelser`, `/patient/anmeld/[bookingId]`, `/klinik/kalender` og `/klinik/anmeldelser`. Bygget i trin 7: `/akut` (7.4), `/patient/konto` og `/patient/samtykker` (7.7). Admin (6.4) bygges ikke i demoen.

**Patientsiderne på weben er fjernet (2026-10-22, 13.6):** `/start`, `/start/[caseId]`, `/start/[caseId]/send`, `/akut`, `/opret/patient` og alle `/patient/*` findes ikke længere. Patientrejsen er i appen (13.4).

Slugs er danske uden æøå. Alle sider er mobile-first og tjekkes ved 390 px og 1280 px. Design: hvid og blå, farverne i Tailwind-temaet.

### 6.4 Admin (`/admin`, rolle `admin`)

Flyttet til domænet `features/admin` (`features/admin/README.md` 6.4). `/admin/moderation` og `/admin/klinikker` er bygget; seed bruger `admin_set_clinic_status()`.

### 6.5 Beskyttelse af sider

- `proxy.ts`: (0) `/api/*` passerer, (1) vilkårs-gate for sider (2.5), (2) opfrisker session, (3) grov redirect: `/klinik/*`, `/admin/*` uden session → `/login`.
- **Områdevagt:** `/klinik` har et server-layout, der kalder `guardArea(role, area)` (`platform/middleware/areaGuard.ts`): ikke logget ind → `/login?naeste=…`, anonym eller forkert rolle → forsiden (klinikker til `/klinik`). Patienter har intet område på weben (`AREA_HOME.patient = "/"`).
- Ingen klientside rollevagt. Navigation viser links ud fra rollen, men adgang afgøres af layout-vagten og API/RLS. Siderne henter alle data via API'et.

## 9. Billeder og storage

### 9.1 Buckets

Status: begge buckets oprettes af migrationssættet (trin 0). Upload til `public-media` er bygget i trin 1 (9.5) og til `case-images` i trin 3 (9.3, 10.5).

| Bucket | Type | Indhold |
|---|---|---|
| `case-images` | **privat** | Patientens mundfotos (helbredsdata): sagsbilleder `{case_id}/…` og beskedbilleder fra patient og klinik `messages/{lead_id}/…` (leads 10.12; præfiks i samme bucket, så der ikke skal oprettes en ny bucket på det fælles projekt) |
| `public-media` | offentlig | Kliniklogoer, tandlægeportrætter og porteføljebilleder |

Notifikationer (14) sender aldrig billeder eller links til billeder.

## 10. API-kontrakter

Typer i `lib/<domæne>/types/`, zod-skemaer i `lib/<domæne>/schemas/`. "Rolle" angiver hvem routen er for; alle andre får 403/404.

**Status:** 10.2 og 10.3 har en Status-kolonne pr. route (kernen er bygget i trin 0, klinik-signup og `clinic` på `/api/me` i trin 1). 10.4 (katalog) og 10.8 (egen klinik) er bygget i trin 1 og 1.9. 10.7 (offentlig klinikoversigt og profil) og den offentlige del af 10.13 (`GET /api/clinics/{id}/reviews`) er bygget i trin 2. 10.5 og 10.6 er bygget i trin 3, leads i 10.5 i trin 4. 10.9 og 10.12 er bygget i trin 5. 10.10 (6.1) og 10.13 (6.2) er bygget; 10.11 er bygget i 7.3; 10.14 er bygget (i `features/admin`). Typerne i 10.1 findes for de bygget dele (roller, samtykker); resten oprettes med deres trin.

### 10.1 Delte typer

```ts
// lib/common/types/common.ts
export type Role = (typeof ROLES)[number];   // ROLES = ["patient", "clinic", "admin"] as const i lib/identity/constants/roles.ts (2.1)
export type PriceRange = { min: number; max: number };  // hele kroner
export type ImageDto = { id: string; url: string; view: string | null; quality: string | null; description: string | null; createdAt?: string };  // createdAt: kun patientens egne billeder (cases 7.9c)
export type TrustpilotInfo = { url: string; score: number | null; reviewCount: number | null; updatedAt: string | null; enteredBy: "clinic" | "admin" } | null;

// lib/clinics/types/services.ts
export type ServiceCategory = "cosmetic" | "general" | "emergency";
export type ServiceDto = { id: string; slug: string; name: string; description: string; category: ServiceCategory; defaultDurationMin: number;
  groupId: string; groupSlug: string };

// lib/booking/types/reviews.ts
export type PriceAccuracy = (typeof PRICE_ACCURACY_VALUES)[number];   // lib/booking/constants/reviews.ts
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];  // lib/booking/constants/reviews.ts
export type ReviewStats = {
  reviewCount: number; avgStars: number | null; priceAccuracyPct: number | null;
  distribution: { asQuoted: number; slightlyHigher: number; muchHigher: number } | null;
};

// lib/identity/types/consents.ts
export type ConsentType = "health_data_sharing" | "image_upload" | "ai_processing";
```

### 10.14 Admin

Flyttet til `features/admin/README.md` 10.14 (moderation og klinikstatus; bygget).

---

## 14. Notifikationer

**Bygget (2026-11-04), trin 11, PR A** (`docs/arbejdsplan.md`; server, database og `lib/` er bygget, klinik-webbens UI og appens del følger i 11.7-11.8). Dækker e-mail og web push (browser) til klinikken, push i patient-appen og påmindelser dagen før en booket tid. Web push blev føjet til som en tredje kanal i samme outbox og samme migration (besluttet 2026-11-04), før nogen migration var kørt, så der ikke skal en ekstra migration til. Push-tokens står i identity (4.3 `push_tokens`, 10.15), klinikkens e-mailvalg i clinics (4.3 `clinic_notification_settings`, 10.19), og appens del i `mobile/README.md` 13.10.

**Tilføjet 2026-11-05:** notifikationsklokken for klinik og patient (14.11) og patientens e-mail og SMS om bookinger (14.12), begge i migrationerne `20261108000100…000300`. Uden nøgler og tilladelser virker klokken stadig, og hver e-mail, SMS og push til telefon giver en linje i serverloggen (14.6).

### 14.1 Valg: outbox i Postgres

Den enkleste robuste løsning til prototypen er en **outbox-tabel** (`notification_outbox`) i den database, vi allerede har. Ingen ekstern kø, ingen Supabase-webhooks eller Edge Functions (princip 8).

- **Rækker lægges af databasen**, i AFTER-triggere på `leads`, `messages` og `bookings` (14.4). De skrives i samme transaktion som handlingen, så en notifikation kun findes, hvis handlingen er committet, og forsvinder, hvis den rulles tilbage. Ingen kodevej kan glemme den, heller ikke `send_emergency_lead()`, `clinics_after_owner_removed()` eller en fremtidig funktion, der ændrer en booking.
- **Fejl vælter aldrig handlingen.** Enqueue-delen i triggerne er pakket ind i `begin … exception when others then raise warning '…' end` (uden indhold i advarslen). Afsendelsen sker først efter commit og uden for requestens svar.
- **Afsendelse** sker af `NotificationDispatcher` (14.6) på to måder: (a) lige efter svaret, med Next.js' `after()`, i de routes, der kan udløse en notifikation (`withApi(handler, { notify: true })`, 14.6); (b) som sikkerhedsnet hvert 5. minut via `/api/cron/notifications`. I demoen kører ingen cron (2.3), så (a) er det, der virker lokalt; (b) og påmindelserne (14.8) kræver hosting eller et manuelt kald.
- **Intet sendes to gange:** `dedup_key` er unik (fx `clinic_new_lead:<lead_id>`), så samme hændelse kun kan ligge én gang. Afsendelsen tager rækker med `for update skip locked` og en lås på 2 minutter, så to samtidige afsendere aldrig tager samme række. Resend får outbox-rækkens id som `Idempotency-Key`, så et genforsøg efter et nedbrud mellem afsendelse og markering ikke giver en ekstra e-mail. Expos push-API har ingen idempotensnøgle; dør processen præcis mellem afsendelse og markering, kan en push i sjældne tilfælde komme to gange [PROTOTYPE].
- **Fravalgt:** afsendelse direkte i controlleren (kan sende ved en rollback, gør svaret langsomt og kan vælte det), Supabase Database Webhooks/Edge Functions (ny infrastruktur, svært at teste lokalt) og en ekstern kø.

### 14.2 Typer, modtagere og indhold

Ingen notifikation indeholder helbredsdata, patientens navn eller kontaktoplysninger, opsummering, ydelser, beskedtekst, billeder eller links til billeder. E-mails indeholder kun en generisk tekst, evt. et tidspunkt og et link til klinik-weben, hvor klinikken skal være logget ind. Web push til klinikkens browser indeholder kun e-mailens emne som tekst og en intern sti. Push-beskeder indeholder kun en generisk tekst (ingen kliniknavn, ingen ydelse) og en intern sti i appen.

**Kendte begrænsninger [PROTOTYPE]:** (a) Når en klinik forlader platformen (`clinics_after_owner_removed()`), får patienten kun en `patient_lead_answered`-notifikation for leads, der stadig er `sent`. Triggeren `leads_notify_response` reagerer kun på, at `responded_at` går fra `null` til en værdi; et accepteret lead har allerede svaret, så `clinic_left` giver ingen ny push, og `dedup_key` ville alligevel afvise en ny række. Har leadet en fremtidig booking, får patienten en aflysning (`patient_booking_cancelled`); ellers ser patienten det først på sagen. (b) `clinic_notification_settings` slettes ikke ved ejerskifte; en ny ejer af samme klinik arver de gamle valg. Begge kan rettes med en ny migration, hvis de bliver et problem.

| Type | Kanal | Modtager | Udløses af | Emne/tekst (dansk, `lib/common/constants/notifications.ts`) | Link/sti |
|---|---|---|---|---|---|
| `clinic_new_lead` | e-mail og web push | klinikken | nyt lead (`send_leads()`, også akut) | Emne "Ny henvendelse på TandMatch"; akut: "Ny henvendelse på TandMatch – svar inden kl. {HH.MM}". Tekst: "Du har en ny henvendelse på TandMatch. Se den og svar her:" | `<SITE_URL>/klinik/lead/<leadId>` |
| `clinic_new_message` | e-mail og web push | klinikken | besked fra patienten (højst én pr. lead pr. 15 min) | "Ny besked på TandMatch" / "Du har en ny besked fra en patient på TandMatch. Læs den her:" | samme |
| `clinic_booking_created` | e-mail og web push | klinikken | patienten booker (`book_slot()`) | "Ny booking på TandMatch" / "En patient har booket en tid hos jer {dag d. dato kl. HH.MM}. Se bookingen her:" | samme |
| `clinic_booking_cancelled` | e-mail og web push | klinikken | patienten aflyser (`cancel_booking()`) | "Aflyst tid på TandMatch" / "En patient har aflyst tiden {dag d. dato kl. HH.MM}. Tiden er ledig igen i jeres kalender." | samme |
| `clinic_booking_rescheduled` | e-mail og web push | klinikken | patienten flytter en tid (PR B, booking 10.16) | "Flyttet tid på TandMatch" / "En patient har flyttet en tid fra {gammel} til {ny}." | samme |
| `clinic_booking_reminder` | e-mail og web push (hvis valgt) | klinikken | dagen før en booket tid (14.8) | "Påmindelse: booket tid" / "I har en booket tid via TandMatch {dag d. dato kl. HH.MM}." | samme |
| `patient_lead_answered` | push | patienten | klinikken accepterer eller afviser (også systemets `clinic_left`) | Titel "TandMatch", tekst "Klinikken har svaret på din henvendelse." | `/sag/<caseId>` |
| `patient_new_message` | push | patienten | besked fra klinikken (højst én pr. lead pr. 15 min) | "Du har en ny besked fra klinikken." | `/sag/<caseId>/beskeder/<leadId>` |
| `patient_booking_confirmed` | push | patienten | klinikken accepterer et akut-lead, så den reserverede tid bliver booket (`held → booked`). Erstatter `patient_lead_answered` for den beslutning, så patienten kun får én push | "Klinikken har bekræftet din tid." | `/bookinger` |
| `patient_booking_cancelled` | push | patienten | klinikken aflyser (også når klinikken sletter sin konto) | "Klinikken har aflyst din tid. Åbn appen for at se mere." | `/bookinger` |
| `patient_booking_reminder` | push, e-mail og SMS | patienten | dagen før en booket tid (14.8) | "Påmindelse: Du har en tandlægetid {dag d. dato kl. HH.MM}." (ikke "i morgen": tiden kan ligge senere samme dag) | `/bookinger` |
| `patient_booking_created` | e-mail og SMS | patienten | patienten booker (`book_slot()`). Ingen app-push (patienten har selv gjort det) | "Din tid er booket." | `/bookinger` |
| `patient_booking_rescheduled` | e-mail og SMS | patienten | patienten flytter en tid. Tæller som booket: én bekræftelse med den nye tid, ingen aflysning | "Din tid er flyttet." | `/bookinger` |
| `patient_booking_cancelled_self` | e-mail og SMS | patienten | patienten aflyser selv (ikke ved flytning) | "Du har aflyst din tid." | `/bookinger` |
| `patient_review_reminder` | e-mail og SMS | patienten | dagen efter et gennemført besøg, hvis patienten må anmelde og endnu ikke har gjort det (14.8). Ingen app-push | "Hvordan var dit besøg? Skriv gerne en anmeldelse." | `/anmeld/<bookingId>` |

**Regel for patientens e-mail og SMS (14.12):** kun `patient_booking_created`, `patient_booking_rescheduled`, `patient_booking_confirmed`, `patient_booking_cancelled`, `patient_booking_cancelled_self`, `patient_booking_reminder` og `patient_review_reminder` går som e-mail og SMS. `patient_lead_answered` og `patient_new_message` går kun til klokken og app-push. Klinikken får aldrig SMS. Alle typer lægges desuden i klokken (14.11).

Alle e-mails slutter med: "Du får denne e-mail, fordi jeres klinik er oprettet på TandMatch. I kan slå e-mails fra under Klinikprofil → Notifikationer: `<SITE_URL>/klinik/profil#notifikationer`. Svar ikke på denne e-mail." Tidspunkter vises i `Europe/Copenhagen` med de eksisterende hjælpere i `lib/common/domain/time.ts`. E-mailen har både en tekst- og en simpel HTML-del (ingen billeder, ingen sporingspixel, ingen eksterne ressourcer).

**Web push til klinikken (browseren):** samme `clinic_*`-typer som e-mailen, med titlen "TandMatch" og e-mailens emne som tekst (fx "Ny henvendelse på TandMatch", "Ny booking på TandMatch"; ingen tider, kun for akut lead står fristen i emnet). Stien er `/klinik/lead/<leadId>` for `clinic_new_lead` og `clinic_new_message` og `/klinik/kalender` for bookingtyperne (`clinicNotificationPath`, `isAllowedClinicNotificationPath`; service workeren åbner kun disse stier). Beskeden krypteres efter RFC 8291 og signeres med VAPID (RFC 8292) i `VapidWebPushService`; push-tjenesten (Google, Mozilla, Apple, Microsoft) ser kun den krypterede besked. Klinikken vælger typerne til og fra på `/klinik/profil` (clinics 10.19); standard er til for nyt lead, ny besked og ny/flyttet/aflyst tid, og fra for påmindelsen. Der lægges kun en `web_push`-række, hvis ejeren har mindst ét abonnement på det tidspunkt, rækken lægges.

**Modtagere:**
- **Klinikken:** login-e-mailen for klinikkens **nuværende** ejer (`auth.users.email`), slået op af `claim_notifications()` på afsendelsestidspunktet. Ingen e-mail, hvis klinikken ikke har en ejer, ikke er `verified`, eller leadet er sendt før `owner_since` (5.1 regel 16); rækken bliver `skipped`. Klinikkens offentlige `clinics.email` bruges ikke. Klinikken vælger typerne fra og til på `/klinik/profil` (clinics 10.19); valget tjekkes, når rækken lægges i outboxen.
- **Klinikkens browsere:** de nuværende ejers `web_push_subscriptions` (højst 10), slået op af `claim_notifications()` efter samme regler som e-mailen (ejer, `verified`, lead sendt efter `owner_since`). Intet abonnement = `skipped`. Et abonnement slettes, når push-tjenesten svarer 404 eller 410, når ejeren logger ud i browseren (`DELETE /api/web-push-subscriptions`) og når kontoen slettes.
- **Patienten:** alle patientens `push_tokens` (højst 5 enheder). Ingen tokens = `skipped`. Patienten styrer push med telefonens tilladelse og kontakten "Notifikationer" i appen (mobile 13.10).

### 14.3 Datamodel: `notification_outbox`

Migration `20261105000200_notification_outbox.sql`. RLS slået til uden policies: kun triggerne og service role-funktionerne rører tabellen (5.4).

| Felt | Type | Note |
|---|---|---|
| id | uuid PK | Også `Idempotency-Key` hos Resend |
| type | notification_type not null | 14.2 |
| channel | notification_channel not null | `email`, `push`, `web_push` eller `sms` (`sms` fra 2026-11-05). Check (migration `20261108000300`): `clinic_*` er `email` eller `web_push`; `patient_*` er `push`, `email` eller `sms` |
| clinic_id | uuid null FK clinics | Kun `email` og `web_push`. Ejeren slås op ved afsendelse |
| recipient_user_id | uuid null FK profiles on delete cascade | Alle `patient_*`-rækker (push, e-mail og SMS): patientens bruger-id. Check: præcis én af `clinic_id` og `recipient_user_id` efter typen. Adresse og nummer ligger aldrig her, men slås op ved afsendelsen |
| lead_id | uuid null FK leads on delete cascade | |
| booking_id | uuid null FK bookings on delete cascade | Sletter patienten sin konto, forsvinder ventende rækker med bookingen |
| payload | jsonb not null default '{}' | **Kun** nøglerne `caseId`, `leadId`, `bookingId`, `startsAt`, `previousStartsAt`, `holdExpiresAt` (id'er og ISO-tidspunkter). Check-constraint: `payload - array['caseId','leadId','bookingId','startsAt','previousStartsAt','holdExpiresAt'] = '{}'::jsonb` |
| dedup_key | text null **unique** | Fx `clinic_new_lead:<lead_id>`, `patient_booking_reminder:<booking_id>`; web push-rækken har præfikset `web_push:`, patientens e-mail- og SMS-rækker `email:` og `sms:` (`web_push:clinic_new_lead:<lead_id>`). `null` for beskeder (de dæmpes i stedet, 14.4) |
| status | notification_status not null default 'pending' | `pending → sending → sent | failed | skipped`; `sending → pending` ved et genforsøg |
| attempts | smallint not null default 0 | Højst `NOTIFY_MAX_ATTEMPTS` (5) |
| next_attempt_at | timestamptz not null default now() | Udskydelse efter fejl: 1, 5, 15 og 60 minutter |
| locked_until | timestamptz null | Sat ved `claim`; en `sending`-række med udløbet lås kan tages igen |
| sent_at | timestamptz null | |
| last_error | text null | Kun en fejlkode (store bogstaver, tal og understreg; fx `RESEND_429`, `EXPO_DEVICE_NOT_REGISTERED`, `WEBPUSH_410`, `NO_RECIPIENT`, `NO_SITE_URL`, `LOCK_EXPIRED`; `complete_notification()` gemmer intet andet), højst 100 tegn; aldrig svarets indhold, e-mailadresse eller token |
| created_at | timestamptz not null default now() | |

**`web_push_subscriptions`** (klinikejerens browsere; samme migration): `id`, `user_id` (FK profiles, cascade), `endpoint` (unique, `https`, højst 500 tegn), `p256dh` (87 tegn base64url), `auth` (22 tegn base64url), `created_at`, `last_used_at`. RLS: SELECT og DELETE kun `user_id = auth.uid()`; ingen INSERT/UPDATE for klientroller; rækker skrives kun af `register_web_push_subscription()` (5.3). Serveren sender kun til værter hos Google, Mozilla, Apple og Microsoft (`WEB_PUSH_ALLOWED_HOST_SUFFIXES`), både ved registrering og lige før afsendelsen (SSRF).

Indeks: `(status, next_attempt_at)` og `(lead_id, type, created_at)` (dæmpning af beskeder). Rækker med `sent`, `failed` og `skipped` slettes efter 30 dage af `purge_notifications()` (kaldes af `/api/cron/notifications`). Tabellen indgår ikke i patientens dataeksport (den indeholder kun id'er og tidspunkter, som eksporten allerede har).

Konstanterne står både i SQL og i `lib/common/constants/notifications.ts` og ændres samtidig (beslutninger 12.2): `NOTIFY_MESSAGE_THROTTLE_MIN = 15`, `NOTIFY_MAX_ATTEMPTS = 5`, `NOTIFY_LOCK_MINUTES = 2`, `NOTIFY_RETENTION_DAYS = 30`, `BOOKING_REMINDER_HOURS = 24`.

### 14.4 Hvornår lægges en række (triggerne)

Alle tre triggerfunktioner er `security definer`, `search_path = ''`, har ingen EXECUTE for klientroller (5.1 regel 13) og fanger egne fejl (14.1). De lægger rækkerne gennem hjælperen `notification_enqueue()` (samme begrænsninger), som læser `clinic_notification_settings` (manglende række = standardværdierne, clinics 4.3) og for hver `clinic_*`-type lægger en `email`-række og/eller en `web_push`-række efter klinikkens valg (web push kun hvis ejeren har et abonnement). Dæmpningen af beskeder gælder pr. lead, type og kanal.

- **`leads` AFTER INSERT:** `clinic_new_lead` til leadets klinik, hvis `email_new_lead`. Akut (`requested_starts_at is not null`): `payload.holdExpiresAt = least(sent_at + interval '30 minutes', requested_starts_at)` (samme regel som `hold_expires_at`, 4.2; bookingen er ikke indsat endnu, når triggeren kører). `dedup_key = 'clinic_new_lead:' || id`.
- **`leads` AFTER UPDATE:** når `responded_at` går fra `null` til en værdi: er den nye status `booked` (accept af et akut-lead inden for reservationen), `patient_booking_confirmed` (`payload = { caseId, leadId }`, `dedup_key = 'patient_booking_confirmed:' || id`); ellers `patient_lead_answered` til sagens patient, `payload = { caseId, leadId }`, `dedup_key = 'patient_lead_answered:' || id`.
- **`messages` AFTER INSERT** (også beskeder med billeder fra `send_message_with_images()`): `sender_role = 'patient'` → `clinic_new_message` til leadets klinik, hvis `email_new_message`; `sender_role = 'clinic'` → `patient_new_message` til sagens patient (`payload = { caseId, leadId }`). **Dæmpning:** ingen ny række, hvis der findes en række af samme type for samme lead, oprettet inden for de seneste `NOTIFY_MESSAGE_THROTTLE_MIN` minutter.
- **`bookings` AFTER INSERT:** `status = 'booked'` og `rescheduled_from_id is null` → `clinic_booking_created` (hvis `email_booking_changes`), `payload = { leadId, bookingId, startsAt }`. Fra PR B: `rescheduled_from_id is not null` → `clinic_booking_rescheduled` med også `previousStartsAt`. En `held`-booking (akut) giver ingen række her; klinikken får allerede `clinic_new_lead`.
- **`bookings` AFTER UPDATE OF status:** `held → booked` giver ingen række her (den kommer fra `leads`-triggeren ovenfor). `booked → cancelled` med `cancelled_by = 'patient'` → `clinic_booking_cancelled` (hvis `email_booking_changes`), **undtagen** når transaktionsflaget `tm.rescheduling` er sat af `reschedule_booking()` (PR B). `booked → cancelled` med `cancelled_by = 'clinic'` → `patient_booking_cancelled`. `held → cancelled` (afvisning, tilbagetrækning, udløb) giver ingen række; afvisningen giver allerede `patient_lead_answered`. `dedup_key = '<type>:' || booking_id`.
- **Ingen notifikation** ved `withdraw_lead()`, `close_case()`, tilbagetrækning af samtykke, udeblivelse, automatisk gennemførelse eller sletning af en patientkonto (12.3 punkt 35 er uændret).

### 14.5 Afsendelse (funktionerne)

Alle tre er `security definer`, `search_path = ''`, kun `service_role` (5.1 regel 7 og 8; ingen `auth.uid()`).

- `claim_notifications(p_limit integer default 20)`: sætter `pending`-rækker med `next_attempt_at <= now()` og `sending`-rækker med udløbet lås til `sending`, `locked_until = now() + 2 min`, `attempts + 1` (`for update skip locked`, ældste først) og returnerer `id, type, channel, payload, attempts, clinic_id, recipient_user_id` (de to sidste kun til logning) plus **mål**: for `email` `to_email` (den nuværende ejers login-e-mail efter reglerne i 14.2, ellers `null`); for `push` `push_tokens text[]` (patientens tokens, evt. tom); for `sms` `to_phone` (patientens valgte nummer, ellers `null`); for patientens `email` `to_email` (den valgte notifikations-e-mail, ellers login-e-mailen; `null` for en anonym); for `web_push` `web_push_subscriptions jsonb` (liste af `{ endpoint, p256dh, auth }` for den nuværende ejer efter samme regler, evt. tom). En `sending`-række med udløbet lås og `attempts >= 5` bliver `failed` med `LOCK_EXPIRED` i stedet for at blive taget igen.
- `complete_notification(p_id, p_status, p_error_code default null, p_invalid_tokens text[] default null)`: `p_status` er `sent`, `skipped`, `retry` eller `failed`. `retry` sætter `pending` og `next_attempt_at` efter udskydelsen, eller `failed` ved `attempts >= 5`. `p_invalid_tokens` slettes: for `push` fra patientens `push_tokens` (Expos `DeviceNotRegistered`), for `web_push` fra klinikkens nuværende ejers `web_push_subscriptions` (404/410). Kun modtagerens egne rækker røres. `p_error_code` gemmes kun, hvis det består af store bogstaver, tal og understreg (højst 100 tegn); alt andet kasseres.
- `purge_notifications()`: sletter afsluttede rækker ældre end 30 dage; returnerer antal.

### 14.6 Klasser og filer

Alt i `platform/notifications/` (kender ingen domæner; lint som resten af `platform/`, og routes må kun importere `notificationController`). Arv kun fra de abstrakte basisklasser her og `BaseRepository` (2.1.1).

| Fil | Klasse | Ansvar |
|---|---|---|
| `emailService.ts` | `EmailService` (abstrakt) | `send(message: EmailMessage): Promise<void>` med `EmailMessage = { to, subject, text, html, idempotencyKey }`. Validerer felterne og kalder underklassens `deliver()`. Fejl kastes som `NotificationDeliveryError(code, retryable)`, så dispatcheren kan vælge `retry` eller `failed` |
| `resendEmailService.ts` | `ResendEmailService` | `fetch` til `POST https://api.resend.com/emails` (ingen npm-pakke) med `Authorization: Bearer ${RESEND_API_KEY}`, `Idempotency-Key`, `Content-Type: application/json` og body `{ from: EMAIL_FROM, to: [to], subject, text, html }`. Timeout 5 s (`AbortSignal.timeout`). 2xx = sendt; 429, 5xx, timeout og netværksfejl = `retryable`; andre 4xx = ikke `retryable`. Svarets body logges aldrig |
| `consoleEmailService.ts` | `ConsoleEmailService` | Standard i udvikling (uden `RESEND_API_KEY`/`EMAIL_FROM`). Logger kun `[email] <type> til klinik <clinic_id> (outbox <id>)`; aldrig adresse, emne, tekst eller link |
| `fakeEmailService.ts` | `FakeEmailService` | Tests: gemmer beskederne i et felt på instansen (ingen modul-tilstand, 2.1.1), kan sættes til at fejle med en given kode |
| `smsService.ts` | `SmsService` (abstrakt) | `send(message: SmsMessage)` med `SmsMessage = { to, body, idempotencyKey, type, patientId }`; validerer nummer og længde og kalder `deliver()`. Samme mønster som `EmailService` (14.12) |
| `consoleSmsService.ts`, `fakeSmsService.ts` | `ConsoleSmsService`, `FakeSmsService` | Console er standard (der er ingen SMS-udbyder): logger kun `[sms] <type> til patient <id> (outbox <id>)`, aldrig nummer eller tekst. Fake gemmer beskederne på instansen |
| `notificationInboxRepository.ts`, `notificationInboxController.ts` | `NotificationInboxRepository extends BaseRepository`, `NotificationInboxController` | Klokken (14.11): `listLatest`, `countUnread`, `markRead`. Controlleren oprettes pr. request med brugerens klient og session. Routes må importere den ved siden af `notificationController` |
| `pushService.ts` | `PushService` (abstrakt) | `send(messages: PushMessage[]): Promise<PushResult[]>` med `PushMessage = { to: string; title: string; body: string; data: { type: NotificationType; path: string } }` og pr. besked `ok`, `invalid_token` eller `error(retryable)` |
| `expoPushService.ts` | `ExpoPushService` | `fetch` til `POST https://exp.host/--/api/v2/push/send` i bundter af højst 100, `sound: "default"`, evt. `Authorization: Bearer ${EXPO_ACCESS_TOKEN}`. Timeout 5 s. Billetstatus `error` med `details.error = "DeviceNotRegistered"` = `invalid_token`; HTTP 429/5xx = `retryable`. Kvitteringer (receipts) hentes ikke [UDSKUDT] |
| `consolePushService.ts`, `fakePushService.ts` | | Som e-mail-udgaverne. Console logger kun type, modtager-id og antal tokens, aldrig tokens |
| `webPushService.ts` | `WebPushService` (abstrakt) | `send(messages: WebPushMessage[]): Promise<DeliveryResult[]>` med `WebPushMessage = { to: { endpoint, p256dh, auth }, title, body, data: { type, path } }`. Samme mønster som `PushService`; pr. besked `ok`, `invalid_target` eller `error(retryable)` |
| `vapidWebPushService.ts` | `VapidWebPushService` | `fetch` til abonnementets endpoint (kun værter i `WEB_PUSH_ALLOWED_HOST_SUFFIXES`; `redirect: "error"`) med krypteret body (RFC 8291) og `Authorization: vapid t=<jwt>, k=<offentlig nøgle>` (RFC 8292), `TTL: 86400`, `Content-Encoding: aes128gcm`. Timeout 5 s. 201 = sendt; 404 og 410 = `invalid_target` (abonnementet slettes); 429, 5xx, timeout og netværksfejl = `retryable`; andre 4xx = ikke. Svarets body læses og logges aldrig |
| `webPushCrypto.ts` | (rene funktioner) | `encryptWebPushPayload()` (RFC 8291 med Nodes `crypto`: ECDH P-256, HKDF, AES-128-GCM; testet med bilag A), `createVapidPrivateKey()` og `createVapidAuthorization()` (JWT ES256 i rå r‖s-form). Ingen npm-pakke |
| `consoleWebPushService.ts`, `fakeWebPushService.ts` | | Som de øvrige. Console logger kun type, klinik-id og antal browsere, aldrig endpoints, nøgler eller tekst |
| `notificationServices.ts` | (funktioner) `createEmailService()`, `createPushService()`, `createSmsService()`, `createWebPushService()` | Vælger: `NOTIFICATIONS_FAKE=1` uden for produktion → fakes; e-mail: Resend, hvis `RESEND_API_KEY` og `EMAIL_FROM` er sat, ellers Console (i produktion med en advarsel uden indhold); push: Expo (ingen nøgle nødvendig; `PUSH_LOG_ONLY=1` giver Console); web push: `VapidWebPushService`, hvis `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` og `VAPID_SUBJECT` er sat og gyldige, ellers Console |
| `notificationOutboxRepository.ts` | `NotificationOutboxRepository extends BaseRepository` | `claim(limit)`, `complete(id, status, errorCode?, invalidTargets?)`, `purge()`, `enqueueBookingReminders()`; kun RPC'erne i 14.5 og 14.8 |
| `notificationDispatcher.ts` | `NotificationDispatcher` | `flush(limit = 20)`: `claim` → bygger beskeden med de rene funktioner i `lib/common/domain/notifications.ts` → `EmailService`/`PushService`/`WebPushService` → `complete`. En fejl i én række påvirker ikke de andre. Returnerer `{ sent, failed, skipped, retried }`. **Log:** alt, der ikke blev sendt (`skipped`, `failed`, `retry`), giver én linje `[<kanal>] <type> til <klinik|patient> <id> sprunget over|fejlede|udskudt: <KODE> (outbox <id>)`; de afsendte logges af Console-tjenesterne. Det dækker også patienter uden push-token og uden e-mail eller nummer (`NO_RECIPIENT`). Aldrig adresse, nummer, token eller tekst. |
| `notificationController.ts` | `NotificationController` | Session-løs (2.1.1). `flush()`, `sendBookingReminders()` (enqueue + flush) og `runScheduled()` (flush + purge). Service role via `lazyAdminClient()` med kommentaren `// 2.3 (i)` |

**`withApi(handler, { notify: true })`** (`platform/middleware/http.ts`): når handleren har returneret et svar med status 2xx, kaldes `after(() => new NotificationController().flush())` (`after` fra `next/server`; læs `node_modules/next/dist/docs/` før brug). Fejl i flush fanges og logges kun med fejlnavnet. For at undgå en cirkulær import (`http.ts` → `notificationController` → `BaseRepository` → `http.ts`) hentes controlleren med `await import("@/platform/notifications/notificationController")` inde i `after`-callbacken. Routes med `notify: true`: `POST /api/cases/{id}/leads`, `POST /api/emergency-leads`, `POST /api/leads/{id}/decision`, `POST /api/leads/{id}/messages`, `POST /api/leads/{id}/booking`, `POST /api/bookings/{id}/cancel`, `DELETE /api/clinics/me` og (PR B) `POST /api/bookings/{id}/reschedule`. Glemmes det på en route, sendes notifikationen ved næste flush eller af cron-jobbet; den går ikke tabt.

**Routes:**

| Metode og route | Rolle | Output |
|---|---|---|
| GET `/api/notifications` | klinik eller patient med konto | 200 `{ items: NotificationItemDto[], unreadCount }` (de 20 nyeste og antal ulæste, højst 100). Pollingen bruger den samme route (14.11) |
| POST `/api/notifications/read` | klinik eller patient med konto | Body `{ ids?: uuid[] }` (1-100; uden `ids` markeres alle). 204, også for fremmede id'er |
| GET og POST `/api/cron/notifications` | intern (`CRON_SECRET` som de andre cron-routes; undtaget fra vilkårs-gaten), hvert 5. minut | 200 `{ sent, failed, skipped, retried, purged }`; 401 `UNAUTHORIZED` uden gyldig hemmelighed |
| GET og POST `/api/cron/booking-reminders` | intern (`CRON_SECRET`), hver time | 200 `{ enqueued, reviewReminders, sent, failed, skipped, retried }`; 401 `UNAUTHORIZED` |

Ingen persondata i svar eller logs.

### 14.7 Delt kode i `lib/` og GDPR

- `lib/common/types/notifications.ts`: `NotificationType` (fra `NOTIFICATION_TYPES` i `lib/common/constants/notifications.ts`), `NotificationPayload`, `PushData = { type: NotificationType; path: string }`, `NotificationChannel`.
- `lib/common/constants/notifications.ts`: typerne, de danske tekster i 14.2, e-mailfoden og konstanterne i 14.3.
- `lib/common/domain/notifications.ts` (rene funktioner, testes direkte): `renderClinicEmail(type, payload, siteUrl): { subject, text, html }` (HTML-escaper alt), `renderPatientPush(type, payload): { title, body }`, `patientNotificationPath(type, payload): string` og `isAllowedNotificationPath(path): boolean` (tilladte mønstre: `/sag/<uuid>`, `/sag/<uuid>/beskeder/<uuid>`, `/bookinger`). Appen bruger de to sidste (mobile 13.10).
- **GDPR (helbredsdata, art. 9):** renderfunktionerne tager kun `NotificationPayload` (nøglerne i 14.3) og kan derfor ikke få opsummering, ydelser, beskedtekst eller navn med; en unit-test kører alle typer og tjekker, at teksterne kun indeholder de faste tekster, tidspunkter og links. Push-tekster nævner ikke klinikken (låseskærmen). E-mails går kun til klinikkens egen login-adresse. Udbyderne (Resend for e-mail, Expo og Apple Push Notification service for push) står i privatlivspolitikken (site 6.1) og i `docs/security.md` (databehandlere).

### 14.8 Påmindelse dagen før en booket tid

`enqueue_booking_reminders()` (kun service role) lægger rækker pr. booking, der opfylder: effektiv status `booked` (4.2), `starts_at > now()`, `starts_at <= now() + interval '24 hours'` og `created_at <= starts_at - interval '24 hours'` (en tid, der er booket mindre end et døgn før, får ingen påmindelse). Rækkerne er `patient_booking_reminder` (push, e-mail og SMS, `payload = { bookingId, startsAt }`; dedup-nøgler `patient_booking_reminder:<id>` og `email:`/`sms:`-præfiks) og `clinic_booking_reminder` (e-mail, hvis `email_booking_reminder`, og web push, hvis `web_push_booking_reminder` og klinikken har et abonnement; `payload = { leadId, bookingId, startsAt }`; dedup-nøgler `clinic_booking_reminder:<id>` og `web_push:`-præfiks), og indbakken (klokken) får sin række via `notification_enqueue()`. Alle har `on conflict do nothing`, så jobbet er idempotent og kan køres så tit, det skal. En flyttet tid (PR B) er en ny booking og får sin egen påmindelse; den gamle er aflyst og får ingen. Returnerer antal nye rækker.

`/api/cron/booking-reminders` (hver time) kalder `NotificationController.sendBookingReminders()`. Med en kørsel i timen kommer påmindelsen 23-24 timer før tiden. I demoen kører ingen cron; påmindelsen vises ved at kalde routen manuelt med `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/booking-reminders`.

**Påmindelse om anmeldelse (2026-11-05):** `enqueue_review_reminders()` (kun service role) kaldes af samme route som påmindelserne dagen før og lægger `patient_review_reminder` (e-mail, SMS og klokken, ingen app-push) for hver booking med effektiv status `completed` (sluttid + 24 timer er passeret, så ikke udeblivelse eller aflysning), hos en verificeret klinik, uden anmeldelse, og hvor sluttiden er højst 96 timer gammel (så gamle bookinger ikke får en påmindelse, første gang jobbet kører). `dedup_key = 'patient_review_reminder:' || booking_id` (og `email:`/`sms:`-præfiks i outboxen) gør den idempotent: den sendes højst én gang. Tryk åbner `/anmeld/<bookingId>`. Samme `CRON_SECRET`-beskyttelse som `booking-reminders`.

### 14.9 Tests

- **RLS:** punkt 54-56 og 61-62 i 5.6 (`tests/rls/59_push_tokens.sql`, `60_notification_outbox.sql`, `61_clinic_notification_settings.sql`, `66_web_push_subscriptions.sql`, `67_notification_inbox.sql`).
- **Unit** (`platform/__tests__/notifications/`): `emailAndPushServices.test.ts` (Resend og Expo med `fetch` stubbet: URL, headere inkl. `Idempotency-Key`, body; 429/500/timeout er `retryable`, 400/422 ikke; bundter af 100, `DeviceNotRegistered` → `invalid_token`; Console-tjenesternes log indeholder hverken adresse, token eller tekst), `notificationDispatcher.test.ts` (fakes og et falsk repository: `sent`, `retry` med udskydelse, `failed` efter 5 forsøg, `skipped` uden mål, én fejlende række stopper ikke de andre), `renderNotifications.test.ts` (alle typer renderes, ingen pladsholdere tilbage, HTML escapes, `isAllowedNotificationPath` afviser fx `/klinik`, `https://…`, `/sag/../x` og `/sag/<uuid>?x=`), `inboxAndPatientContact.test.ts`, `serviceWorker.test.ts`, `webPushCrypto.test.ts` og `vapidWebPushService.test.ts`.
- **API** (`platform/__tests__/api/notifications.test.ts`, kører med `NOTIFICATIONS_FAKE=1`): cron-routerne giver 401 uden `CRON_SECRET`; efter et nyt lead, en booking og en aflysning gennem API'et ligger de forventede rækker i outboxen og bliver `sent` efter `POST /api/cron/notifications` (læst med service role i testen); `booking-reminders` to gange giver `enqueued: 0` anden gang; en klinik, der har slået `email_new_lead` fra, får ingen række.
- **Manuelt (tester):** e-mail med `ConsoleEmailService` (loggen) og, hvis brugeren har en Resend-konto, én rigtig e-mail til en testadresse; push på en fysisk iPhone i Expo Go (mobile 13.10).

Klokken og patientens e-mail og SMS (2026-11-05): RLS punkt 62; unit-tests for `renderInboxContent`, `renderPatientEmail` og `renderPatientSms` (ingen navne, behandling eller klinik; alle typer), dispatcheren (patientens e-mail og SMS, `NO_RECIPIENT` og loglinjer uden adresse, nummer og tekst, svar og beskeder giver aldrig e-mail eller SMS) og Console-tjenesterne; API-tests i `platform/__tests__/api/notification-inbox.test.ts` (klokken, marker som læst, e-mail- og SMS-rækker kun for patientens booking-typer og anmeldelsespåmindelsen, anmeldelsespåmindelse én gang); e2e `tests/e2e/notification-bell.spec.ts` (klokken i klinikkens header ved 390 og 1280 px); Jest i appen (`mobile/tests/notification-bell.test.ts`).

Web push har desuden `webPushCrypto.test.ts` (RFC 8291 bilag A: den krypterede body er præcis den i bilaget; dekryptering med en tilfældig nøgle; VAPID-signaturen kan verificeres med den offentlige nøgle) og `vapidWebPushService.test.ts` (headere, generisk indhold, 404/410, retryable, ingen kald til værter uden for listen).

### 14.10 Opsætning (gøres af brugeren, ikke i kode)

1. Resend-konto, verificeret afsenderdomæne (SPF/DKIM) og en API-nøgle med kun "Sending access". `RESEND_API_KEY` og `EMAIL_FROM` i `.env.local` (12.3 punkt 48). Uden dem logges e-mails kun.
2. Expo-projekt (`eas init`), så `extra.eas.projectId` står i `mobile/app.json`; uden projekt-id kan appen ikke få et Expo push-token (12.3 punkt 49).
3. Ved hosting: cron for `/api/cron/notifications` (hvert 5. minut) og `/api/cron/booking-reminders` (hver time) med `CRON_SECRET`.
4. Web push: kør `node scripts/generate-vapid-keys.mjs` og læg de tre linjer i `.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Den private nøgle må aldrig i git. Uden nøglerne logges web push kun. Ved hosting sættes de tre variabler hos udbyderen.

### 14.11 Klokken (indbakken i klinik-weben og appen)

**Bygget 2026-11-05**, migration `20261108000100_notification_inbox.sql`. Klokken virker uanset klinikkens e-mail- og push-indstillinger, uden tilladelser og uden nøgler: den læser kun databasen.

- **Tabel `user_notifications`:** `id`, `user_id` (FK profiles, cascade), `type notification_type`, `lead_id` og `booking_id` (FK, cascade; en slettet sag fjerner notifikationen), `payload jsonb` (samme nøgler og check som outboxen: kun id'er og ISO-tidspunkter), `dedup_key text unique`, `read_at`, `created_at`. Ingen tekst gemmes: **titel, brødtekst og sti renderes** af `renderInboxContent(type, payload)` i `lib/common/domain/notifications.ts` (titlen er klinikkens e-mailemne eller patientens pushtekst; brødteksten er kun tidspunktet for bookingtyperne; stien er `clinicNotificationPath` eller `patientNotificationPath`, og begge godkendes af `isAllowedClinicNotificationPath` / `isAllowedNotificationPath`). Helbredsdata og navne kan derfor ikke komme med.
- **Modtager:** klinikkens **nuværende ejer** (`clinics.owner_id` på det tidspunkt, rækken lægges) eller patienten. En ny ejer ser ikke den gamle ejers notifikationer (andet `user_id`). Findes der ingen ejer, lægges ingen række.
- **Hvornår:** `notification_enqueue()` (14.4) lægger først indbakkerækken, derefter outbox-rækkerne, så de samme hændelser giver klokke, e-mail og push i samme transaktion. Påmindelserne (14.8) lægges af `enqueue_booking_reminders()` og `enqueue_review_reminders()`. Indbakken fanger egne fejl (`raise warning` uden indhold), så den aldrig ruller handlingen tilbage. Beskeder: ingen ny række, så længe modtageren har en **ulæst** af samme type for samme lead (ikke en tidsgrænse som i outboxen).
- **RLS:** SELECT kun `user_id = auth.uid()`; ingen INSERT, UPDATE eller DELETE for klientroller. `mark_notifications_read(p_ids)` (security definer, `search_path = ''`) markerer egne rækker. Rækker ældre end 30 dage slettes af `purge_notifications()`.
- **API (14.6):** `GET /api/notifications` og `POST /api/notifications/read`; `NotificationInboxController` i `platform/notifications/`. Rollerne er klinik og patient med konto; anonyme og admin får 403.
- **Klinik-weben:** klokken står i `SiteHeader` (`components/ui/notification-bell.tsx`) mellem hilsen og "Log ud", kun for klinikker. Knappen har ikon og tal for ulæste ("99+" over 99, skjult ved 0) og `aria-label` med antallet. Et tryk åbner en liste med de nyeste (højst 20): titel, tidspunkt, evt. brødtekst og en prik ved ulæste. Tryk på en notifikation markerer den som læst og åbner stien (lead eller kalender). "Marker alle som læst" markerer alle. Listen lukker med Escape, tryk udenfor og ved navigation. Tallet hentes igen hvert 30. sekund **kun mens fanen er synlig** (`useLoad` med `pollMs`, `startVisiblePolling`). Fejl vises med `LoadError`, indlæsning med `LoadState` (2.7).
- **Appen:** klokken står øverst på Forside og Mine sager (`~/components/notifications/notification-bell`) og åbner skærmen `/notifikationer`; se `mobile/README.md` 13.10. Tallet hentes igen hvert 30. sekund, mens skærmen er i fokus og appen i forgrunden (`useFocusPolling`). Tryk åbner stien (kun hvis `isAllowedNotificationPath` godkender den) og markerer notifikationen som læst.

### 14.12 Patientens e-mail og SMS om bookinger

**Bygget 2026-11-05**, migrationerne `20261108000200_notification_sms_and_patient_types.sql` (nye enum-værdier i en egen migration, fordi en ny værdi ikke kan bruges i samme transaktion) og `20261108000300_patient_booking_notifications.sql`. Afsendelsen er automatisk; der er ingen "Send til …"-knap.

- **Hændelser (og kun dem):** tid booket (en flyttet tid tæller som booket: én bekræftelse med den nye tid), tid aflyst (af klinikken eller patienten selv), påmindelse dagen før og påmindelse om anmeldelse dagen efter (14.8). Svar på henvendelse og nye beskeder går **kun** til klokken og app-push. Klinikker får mail, browser-push og klokke, ingen SMS. Typerne står i 14.2 og i `PATIENT_CONTACT_NOTIFICATION_TYPES`.
- **Kontaktdata:** tabellen `patient_notification_contacts` (`patient_id` PK, FK patients cascade; `email`, `phone`; identity 4.3). `patients.phone` genbruges ikke, fordi den overskrives af bookingens kontaktfelt og kun er et forslag; en SMS skal kun gå til et nummer, patienten selv har valgt til notifikationer. E-mail: den valgte adresse, ellers login-e-mailen (`auth.users.email`, slået op af `claim_notifications()`). SMS: kun hvis patienten har angivet et nummer. Mangler den ene, sendes kun på den anden; mangler begge, er der stadig klokken. Rækken lægges altid i outboxen, og mangler målet, bliver den `skipped` med `NO_RECIPIENT` og en loglinje [PROTOTYPE: der er ingen måde at slå e-mail fra på].
- **Beskyttelse:** RLS som i 5.4; kun patienten (permanent konto) ser og retter egen række. Ingen klinikfunktion læser tabellen, og klinikkens adgang til kontaktoplysninger er uændret (først efter accept og booket tid, fra bookingens eget kontaktfelt, 5.1). Adressen og nummeret ligger aldrig i outboxens `payload`, i klokken eller i loggen; de slås op af `claim_notifications()` (kun service role) ved afsendelsen. Tabellen slettes med kontoen (cascade) og indgår i dataeksporten som `notificationContact` (identity 10.20).
- **Tekster** (`PATIENT_CONTACT_TEXTS`, generiske, uden behandling, klinik eller helbredsdata; tidspunktet er med, når payload har det): booket "Du har en tid på TandMatch {tid}. Se detaljer i appen.", aflyst "Din tid på TandMatch {tid} er aflyst. Se detaljer i appen.", påmindelse "Du har en tid på TandMatch {tid}. Se detaljer i appen.", anmeldelse "Du har haft en tid på TandMatch. Skriv gerne en anmeldelse i appen." SMS har præfikset "TandMatch: ". E-mailen har en fodnote om, hvor adressen og nummeret ændres (Konto i appen), og ingen links.
- **Klasser:** `EmailService` genbruges til patientmails (`EmailMessage.recipient = { kind, id }`); `SmsService` er ny (14.6). Ingen rigtig SMS-udbyder: `ConsoleSmsService` logger `[sms] <type> til patient <id> (outbox <id>)`, og e-mails logges af `ConsoleEmailService` uden nøgler.
- **API:** `GET` og `PUT /api/patients/me/notification-contact` (identity 10.20), `{ email, phone }` med `null` for at rydde; telefon valideres af `phoneSchema`.
