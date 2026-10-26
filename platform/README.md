# Platform (`platform/`)

Tværgående kode, som alle domæner bruger: middleware (`requireTerms`, `requireRole`, rate limit, områdevagt), databaseklienter og fejloversættelse (`db/`), basisklasser (`base/`), cron, billedbehandling og klientsikre UI-hjælpere (`ui-utils/`). platform/ kender ingen domæner, bortset fra cron og session-/vilkårsvagten, som bruger `features/identity` og `features/booking` via deres `index.ts`.

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

**Ingen tilstand på tværs af requests.** Instanser oprettes pr. request og kasseres bagefter. Der må ikke være modul-singletons med en Supabase-klient, en session eller brugerdata, og ingen statiske felter med muterbar tilstand. Uforanderlig konfiguration (konstanter, `AI_RULES`, en OpenAI-klient uden brugerdata) må deles.

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
| `SUPABASE_SERVICE_ROLE_KEY` | kun server, kun via `createSupabaseAdminClient()` | Må **kun** bruges til: (a) AI-skrivninger `append_assistant_message()` og `store_ai_summary()` (5.3), (b) `try_consume_anonymous_ai_call()` og `consume_rate_limit()` (5.3), (c) upload og sletning af billedfiler og `case_images`-rækker, også ved sletning af sag og tilbagetrækning af samtykke (9.2-9.4), samt upload af beskedbilleder og kaldet `send_message_with_images()` efter serverens deltager-, tråd- og samtykketjek (leads 10.12), (d) upload og sletning i den offentlige bucket `public-media` efter ejertjek (9.5), (e) signering af URL'er til `case-images` (også beskedbilleder), efter at stien er hentet gennem en RLS-beskyttet læsning (9.2; leads 10.12), (f) sletning af auth-bruger ved kontosletning, sletning af anonym session og sletning af den anonyme bruger efter overdragelse af kladden til en konto (`POST /api/session/claim`, identity 10.2), (g) de planlagte jobs: oprydning af anonyme sessioner (7.7) og `complete_due_bookings()` (5.3), (h) seed- og admin-scripts, herunder `admin_set_clinic_status()`. Aldrig til at læse data på brugerens vegne |
| `OPENAI_API_KEY` | kun server | |
| `OPENAI_MODEL` | kun server | Model med vision + structured outputs. Falder tilbage til `DEFAULT_MODEL` i `features/cases/ai/openai.ts` |
| `CRON_SECRET` | kun server | Beskytter `/api/cron/cleanup-anonymous` og `/api/cron/complete-bookings` |
| `TERMS_COOKIE_SECRET` | kun server | HMAC-nøgle til vilkårs-cookien (2.5) |

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
  - `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data: blob:` + Supabase-projektets URL (`public-media` og signerede URL'er fra `case-images`) + OpenStreetMaps fliseserver fra trin 2; `connect-src 'self'` (browseren kalder kun vores eget API, aldrig Supabase direkte); `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. Scripts og styles tillader i prototypen `'unsafe-inline'` [PROTOTYPE, 0.1]; nonce-løsning senere.
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
| message_images | Kun patienten direkte via `is_lead_patient(lead_id)` (kolonne-grant uden `consent_id`). **Klinikker har ingen SELECT**; de læser via `clinic_lead_message_images()` (5.7) | ingen for `authenticated`: kun `send_message_with_images()` (service role) | ingen | ingen (cascade fra `messages`/`leads`; `withdraw_consent()`) |
| messages | Kun patienten direkte: `sender_id = uid` eller sagens ejer via `is_case_owner`. **Klinikker har ingen SELECT**; de læser via `clinic_lead_messages()` (5.7). Kolonne-grant: `authenticated` kan læse `id`, `lead_id`, `sender_role`, `body`, `created_at` og `read_at`, men ikke `sender_id` (klinikejerens bruger-id; security trin 5, L1; migration `20261024000100`) | `sender_id = uid` og `is_permanent_user()` og `is_lead_participant(lead_id)` og `is_lead_thread_open(lead_id)` og ikke-tom `body` (fra migration `20261103000100`; beskeder med billeder og evt. tom tekst indsættes kun af `send_message_with_images()`) (`created_at`/`read_at` sættes af trigger, 5.1 regel 15) | patienten må sætte `read_at` på modtagne beskeder (`sender_role = 'clinic'`, også når afsenderen er slettet; kolonne-grant); klinikken via `clinic_mark_messages_read()`. `messages_before_insert()` er security definer og udleder `sender_role` (en afvigende værdi giver `SENDER_ROLE_MISMATCH`); `messages_before_update()` tillader kun, at `sender_id` bliver null (migration `20261023000100`) | ingen |
| bookings | `patient_id = uid`. Klinikker **ingen** direkte; kun via `clinic_bookings()`/`clinic_lead_detail()` | ingen (kun `book_slot`) | ingen (kun `cancel_booking`, `complete_booking`) | ingen |
| reviews | `patient_id = uid` eller `is_admin()`. Offentligt via `public_reviews()`, klinikken via `clinic_reviews()` | se 8.1 | ingen | ingen ([IKKE BYGGET]) |
| review_replies | `clinic_id = auth_clinic_id()` eller `is_admin()`. Offentligt via `public_reviews()` | `review_is_for_my_clinic(review_id)` og `review_is_approved(review_id)` og `clinic_id = auth_clinic_id()` | ingen | ingen |

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

API-tests (obligatoriske): vilkårs-gaten (403 `TERMS_REQUIRED`, forfalsket cookie afvises, ny version kræver ny accept) og "vilkårs-accept giver ikke samtykke" (403 `CONSENT_REQUIRED` ved upload/chat).

## 6. Sider og routes (App Router)

Status: bygget i trin 1 er `/opret/klinik`, `/klinik` (opsætningsoversigt; fra 5.3 også lead-indbakken, se 6.3), `/klinik/profil`, `/klinik/prisliste` (med kategorier, 1.9), `/klinik/aabningstider` og `/klinik/tandlaeger`, samt kernens sider (vilkår, login, `/opret`, `/opret/patient`). Bygget i trin 2 (`a3f8d47b`, `ea70980b`): `/`, informationssiderne, `/klinikker` og `/klinikker/[clinicId]`. Bygget i trin 3 (3.4): `/start` og `/start/[caseId]`. Bygget i trin 4: `/start/[caseId]/send`, `/patient` og `/patient/sag/[caseId]`. Bygget i trin 5 (5.3): lead-indbakken på `/klinik` og `/klinik/lead/[leadId]`. Bygget i trin 6: `/patient/sag/[caseId]/book/[leadId]`, `/patient/bookinger`, `/patient/anmeldelser`, `/patient/anmeld/[bookingId]`, `/klinik/kalender` og `/klinik/anmeldelser`. Bygget i trin 7: `/akut` (7.4), `/patient/konto` og `/patient/samtykker` (7.7). Admin (6.4) bygges ikke i demoen.

**Patientsiderne på weben er fjernet (2026-10-22, 13.6):** `/start`, `/start/[caseId]`, `/start/[caseId]/send`, `/akut`, `/opret/patient` og alle `/patient/*` findes ikke længere. Patientrejsen er i appen (13.4).

Slugs er danske uden æøå. Alle sider er mobile-first og tjekkes ved 390 px og 1280 px. Design: hvid og blå, farverne i Tailwind-temaet.

### 6.4 Admin (`/admin`, rolle `admin`)

| Route | Indhold |
|---|---|
| `/admin/moderation` | **[IKKE BYGGET]**, ikke planlagt i demoen. Kø af `pending` anmeldelser og svar |
| `/admin/klinikker` | [UDSKUDT] Verifikation og import af klinikker. Demoen bruger `admin_set_clinic_status()` i seed |

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

## 10. API-kontrakter

Typer i `lib/<domæne>/types/`, zod-skemaer i `lib/<domæne>/schemas/`. "Rolle" angiver hvem routen er for; alle andre får 403/404.

**Status:** 10.2 og 10.3 har en Status-kolonne pr. route (kernen er bygget i trin 0, klinik-signup og `clinic` på `/api/me` i trin 1). 10.4 (katalog) og 10.8 (egen klinik) er bygget i trin 1 og 1.9. 10.7 (offentlig klinikoversigt og profil) og den offentlige del af 10.13 (`GET /api/clinics/{id}/reviews`) er bygget i trin 2. 10.5 og 10.6 er bygget i trin 3, leads i 10.5 i trin 4. 10.9 og 10.12 er bygget i trin 5. 10.10 (6.1) og 10.13 (6.2) er bygget; 10.11 er bygget i 7.3; 10.14 er [IKKE BYGGET]. Typerne i 10.1 findes for de bygget dele (roller, samtykker); resten oprettes med deres trin.

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

Hele admin-API'et er [IKKE BYGGET] og ikke planlagt i demoen: moderation (`/api/admin/moderation`) og klinikstatus (`/api/admin/clinics/{id}/status`) [UDSKUDT].

---
