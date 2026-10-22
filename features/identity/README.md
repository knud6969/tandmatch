# Identitet (`features/identity`)

Domænet dækker login, sessioner, vilkår, samtykker, patientprofil, eksport og sletning af konto.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 2. Systemarkitektur (MVC, adskilt frontend og backend)

### 2.5 Vilkårs-gate

Bygget; uændret i den nye model, bortset fra rollenavnet `clinic`.

Alle, også besøgende uden session og anonyme patienter, skal acceptere **brugervilkår** og bekræfte at have læst **privatlivspolitikken**, før de kan bruge siden. Aktuelle versioner står i `lib/identity/constants/legal.ts` (`TERMS_VERSION`, `PRIVACY_VERSION`), i prototypen `v0-prototype`. Ændres en version, kræves ny accept.

**Hvor accepten gemmes:**
1. **Uden session:** `POST /api/terms/accept` sætter en `httpOnly`, `secure`, `sameSite=lax`-cookie `tm_terms` med `{ termsVersion, privacyVersion, acceptedAt }`, signeret med HMAC (`TERMS_COOKIE_SECRET`), levetid 12 måneder. Ingen session eller databaserække for besøgende, der kun kigger.
2. **Med session** (anonym patient, patient, klinik, admin): accepten skrives i `terms_acceptances` (a) når en session oprettes (`/api/session/anonymous`, `/api/auth/signup`, `/api/auth/login`, `/api/auth/convert`), med cookiens `acceptedAt`, og (b) når en bruger med session accepterer en ny version.
3. **Patient-appen:** appen har ingen cookies. `POST /api/terms/accept` med `X-TandMatch-Client: mobile` sætter ingen cookie, men returnerer `{ termsToken }`: den samme HMAC-signerede payload som cookien (`signTermsPayload()`, samme levetid på 12 måneder). Appen gemmer den i `expo-secure-store` og sender den som headeren `X-Terms-Token` på alle kald. `requireTerms()` (via `readCurrentTerms()`) læser ved cookie-transport cookien og derefter headeren, og ved bearer-transport (2.4: `Authorization` eller `X-TandMatch-Client: mobile`) **kun** `X-Terms-Token`, med samme verifikation (`verifyCurrentTermsCookie()`); vilkårscookien læses og skrives aldrig ved bearer-transport, heller ikke hvis browseren har en; resten af gaten er uændret (uden session kræves gyldig token; med session bruges `terms_acceptances`, og tokenets accept overføres, hvis rækken mangler). En ny vilkårsversion giver 403 `TERMS_REQUIRED`, og appen viser vilkårsskærmen igen. Appens vilkårsskærm har de to afkrydsningsfelter og åbner teksterne som links til `/vilkaar` og `/privatliv` på serveren (`expo-web-browser`; siderne er undtaget fra gaten), så teksterne kun findes ét sted. Versionerne kommer fra `lib/identity/constants/legal.ts`.

**Håndhævelse:**
- **Sider:** `proxy.ts` kræver gyldig `tm_terms` med aktuelle versioner, ellers redirect til `/vilkaar/accepter?naeste=<sti>`. Undtaget: `/vilkaar*`, `/privatliv` og statiske filer.
- **API:** `proxy.ts` lader `/api/*` passere. Hver route kalder `requireTerms()` (`platform/middleware/termsGate.ts`) før rolletjek: gyldig cookie eller `X-Terms-Token` **eller**, med session, en række i `terms_acceptances`. Ellers 403 `TERMS_REQUIRED`. Undtaget: `/api/terms/*`, `/api/cron/*`, `POST /api/auth/logout`, `POST /api/auth/refresh` (fornyer kun et eksisterende login; 10.2).
- **`naeste`** valideres som relativ sti på samme site af `safeInternalPath()` i `lib/common/navigation/paths.ts`; ugyldige værdier bliver `/`.

**Vilkårs-accept er IKKE samtykke.** Samtykke efter GDPR art. 9 til AI-behandling (`ai_processing`), billedupload (`image_upload`) og deling med klinikker (`health_data_sharing`) indhentes særskilt, i konteksten, med egne ikke-forudafkrydsede felter, og gemmes i `consents` (4.3). Ingen route må bruge vilkårs-accept som grundlag for upload, AI-kald eller deling.

## 3. Roller og rettigheder

Status: rollerne og rettighederne er bygget i databasen (trin 0). Klinikkens signup, opsætnings-API og opsætningssider er bygget (trin 1); patientens leads og sagssider er bygget (trin 4); klinikkens leads, indbakke og beskedtråd er bygget (trin 5); booking, kalender og anmeldelser er bygget (trin 6); akutvejen, `/patient/samtykker` og `/patient/konto` er bygget i trin 7; admin er [IKKE BYGGET].

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
| phone | text null | Indsamles første gang ved booking og foreslås ved næste. Valideres i API (`phoneSchema`) og i databasen med samme regel: tegnene `^[+0-9 ()-]{6,20}$` og mindst 8 cifre (`MIN_PHONE_DIGITS`). Databasens del er `is_valid_phone()` (5.3), brugt i check constraints på `patients.phone`, `clinics.phone` og `bookings.contact_phone` og i `book_slot()`/`send_emergency_lead()` (bygget i 7.1, migration `20261028000100`; security kompromis 23). Når klinikken kun via bookingens kontaktfelter (4.4) |
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
| text_version | text not null | Skal findes i `consent_text_versions` (trigger). Teksten ligger i `lib/identity/constants/consents.ts` |
| granted_at | timestamptz not null default now() | Sættes server-side |
| granted_while_anonymous | boolean not null default false | |
| withdrawn_at | timestamptz null | |
| pending_storage_paths | text[] null | Filer, der skal slettes efter tilbagetrækning (`withdraw_consent()`) |
| cleanup_done | boolean not null default true | `false` indtil `confirm_consent_cleanup()` |

"Aktivt samtykke" = seneste række af typen med `withdrawn_at is null`. "Gældende samtykke" = aktivt samtykke med den tekstversion, der står i `CONSENT_TEXT_VERSIONS`. Serveren kræver det gældende samtykke før chat, opsummering, upload og afsendelse af leads (også akut) med **ét** kald, `ConsentsRepository.requireCurrentActive(type, message)`, som returnerer samtykket eller kaster 403 `CONSENT_REQUIRED` (`consentRequired(message)` fra `platform/middleware/http.ts`); controllerne har ingen egne kopier af tjekket (bygget i 7.12a). **Databasen håndhæver det samme** (bygget, migration `20261028000500`): `has_active_consent(type)` er kun sand, når den seneste række af typen ikke er trukket tilbage **og** dens tekstversion ikke er pensioneret (`consent_text_versions.retired_at is null`). Dermed kræver `send_leads()`, og dermed `send_emergency_lead()`, det gældende delingssamtykke uden ændringer i selve funktionerne (security 7.11 M1).

**Kontrakt for tekstversioner:**
- Hver type har præcis én ikke-pensioneret version i `consent_text_versions`, og den er lig `CONSENT_TEXT_VERSIONS[type]` i `lib/identity/constants/consents.ts`.
- En ny version kræver én migration, der indsætter den nye række og sætter `retired_at = now()` på den forrige version af typen, og den nye konstant i samme commit.
- `is_allowed_consent_text(type, version)` er kun sand for en ikke-pensioneret version, så policyen på `consents` afviser nye samtykker til en pensioneret tekst, også ved direkte insert med patientens JWT. `POST /api/consents` afviser allerede alt andet end `CONSENT_TEXT_VERSIONS` (400).
- Pensionerede versioner slettes aldrig: eksisterende samtykker til dem (FK) bliver stående som historik, kan ses på samtykkeskærmen i appen og på `/patient/samtykker` ("ældre tekst" med "giv igen") og kan trækkes tilbage, men giver ikke længere ret til at sende leads, chatte, uploade eller få en opsummering. Leads, der allerede er sendt med et v0-samtykke, består, indtil patienten trækker samtykket tilbage eller lukker sagen.

Gældende tekstversioner: `ai_processing@v0-prototype`, `image_upload@v1-ai-disclosure` og `health_data_sharing@v1-klinikker` (bygget i 7.2, migration `20261028000200`). Pensioneret: `health_data_sharing@v0-prototype` (migration `20261028000500`, bygget i 7.12a). **Tilbagetrækning gælder typen:** `withdraw_consent(id)` trækker alle patientens aktive samtykker af samme type tilbage på én gang, uanset version, og konsekvensen (billeder slettes, samtaler lukkes, leads trækkes tilbage) udløses altid (samme migration; security 7.11 M2).

| Samtykketype | Kræves før | Anonymt? | Dækker |
|---|---|---|---|
| `ai_processing` | Anonym session, chat og AI-opsummering | ja | Behandling af chat, tekst og billeder hos OpenAI og opbevaring i 48 timer, hvis der ikke oprettes konto |
| `image_upload` | Upload af billeder | ja | Opbevaring af mundfotos og deling med de klinikker, patienten senere sender sagen til |
| `health_data_sharing` | Afsendelse af leads | **nej**, kun med konto | Deling af godkendt opsummering, bekræftede ydelser, ønsket tidsrum, område og billeder med de op til 3 klinikker, patienten vælger. Teksten nævner også, at navn og kontaktoplysninger deles med klinikken ved booking |

## 10. API-kontrakter

### 10.2 Auth, anonym session og konto

| Metode og route | Rolle | Input | Output | Status |
|---|---|---|---|---|
| GET `/api/terms/status`, POST `/api/terms/accept` | alle (undtaget fra gaten) | uændret (2.5) | uændret. Med `X-TandMatch-Client: mobile`: ingen cookie, men `{ ..., termsToken }` i svaret (2.5 punkt 3; 12 måneder) | Bygget |
| POST `/api/auth/refresh` | appen (ingen gate; kun `X-TandMatch-Client: mobile`, ellers 400 `VALIDATION_ERROR`) | `{ refreshToken }` (strict) | 200 `{ session: MobileSessionDto }` med `Cache-Control: no-store`; 401 `UNAUTHENTICATED` ved ugyldigt, udløbet eller genbrugt refresh-token (uden for reuse-intervallet på 10 s, 2.4); 503 `AUTH_UNAVAILABLE`. IP-rate limit `auth-refresh` 60 pr. time. Repository: `AuthRepository.refresh(refreshToken)` med en klient uden cookies | Bygget |
| POST `/api/session/anonymous` | besøgende, gyldig vilkårs-accept | `{ aiConsent: { textVersion } }` (strict) | **201** `{ caseId, expiresAt }` ved ny session: opretter anonym session, vilkårs-accept, `ai_processing`-samtykke og tom sag; med `X-TandMatch-Client: mobile` desuden `session: MobileSessionDto`. **200** `{ caseId, expiresAt }` ved retry med eksisterende anonym session: gemmer manglende samtykker og returnerer den eksisterende kladde, **uden tokens** (også fra appen, som allerede har dem). 409 `ALREADY_AUTHENTICATED` ved permanent konto; 429 ved IP-limit | Bygget |
| POST `/api/auth/convert` | anonym patient | `{ email, password (8-72), firstName }` | 200 `{ userId, role: "patient" }`; 409 `EMAIL_EXISTS`. Med bearer: brugeren opdateres via GoTrue med tokenet (samme user id, `is_anonymous = false`), og serveren logger ind igen med de nye oplysninger, så appen får `session: MobileSessionDto` med nye tokens (de gamle anonyme tokens skal ikke bruges mere) | Bygget |
| POST `/api/auth/signup` | besøgende | Diskrimineret på `role`: patient `{ role: "patient", email, password (8-72), firstName (1-50) }`; klinik `{ role: "clinic", email, password (8-72), cvr (8 cifre), clinicName (2-100), address, postalCode, city, phone }`. Med `X-TandMatch-Client: mobile` kun `role: "patient"`; en klinik giver 400 `VALIDATION_ERROR` ("Klinikker opretter sig på weben.") | 201 `{ userId, role }` (med klientheaderen desuden `session: MobileSessionDto`). Signup-triggeren opretter `profiles` + `patients` eller `profiles` + `clinics` (status `registered`). Findes en **importeret** klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE]; har den en ejer: 409 `CLINIC_EXISTS`. Controlleren forhåndstjekker med `is_cvr_claimed()`, fordi fejlen fra triggeren kommer tilbage fra GoTrue som en generisk fejl (4.3). 409 ved aktiv anonym session | Bygget (patient trin 0, klinik trin 1). `is_cvr_claimed()` kaldes via `ClinicsRepository.isCvrClaimed()` |
| POST `/api/auth/login` | | uændret | uændret; med `X-TandMatch-Client: mobile` desuden `session: MobileSessionDto` og ingen auth-cookies | Bygget |
| POST `/api/auth/logout` | (undtaget fra gaten) | ingen | 204. Med bearer: `auth.admin.signOut(token, "local")`, 204 også ved ugyldigt eller udløbet token; cookies røres ikke | Bygget |
| GET `/api/me` | med session | | `{ id, role, isAnonymous, displayName, anonymousExpiresAt, clinic?: { id, name, status } }` | Bygget. `clinic` hentes via `ClinicsRepository.findOwn()` |
| GET/PATCH `/api/patients/me` | patient | PATCH `{ firstName?, postalCode?, phone? }` | `{ firstName, postalCode, phone }` | Bygget (`phone` i 6.1). `phone` valideres med `phoneSchema` (`lib/common/schemas/phone.ts`, samme som klinikkens telefon og bookingens `contactPhone`); `null` rydder nummeret. Gemmes også af `book_slot()` |
| DELETE `/api/patients/me` | patient eller anonym | `{ confirm: "SLET" }` (`deleteAccountSchema` i `lib/identity/schemas/auth.ts`, samme skema som `DELETE /api/clinics/me`; samlet i 7.12b). Med bearer slettes ingen cookies; appen sletter selv sine tokens | 204 | Bygget |
| GET `/api/patients/me/export` | patient eller anonym | | `{ exportedAt, cases, chat, leads, bookings, reviews, consents }` (GDPR art. 20). `chat` = egne AI-samtaler pr. sag. Billeder beskrives med metadata (`id`, `view`, `quality`, `description`, `createdAt`), uden sti eller URL | Bygget: `cases`, `chat` (3.3), `leads` (4.1, `LeadExportDto` uden beskeder og billeder), `bookings` (6.1, `BookingExportDto`: patientens egne bookinger med klinikkens navn, ydelse, effektiv status og de kontaktoplysninger patienten selv har angivet) og `consents` er bygget. `reviews` (6.2, `ReviewExportDto`: patientens egne anmeldelser inkl. `moderationStatus` og `rejectionReason`; klinikkens navn står i `bookings` under samme `bookingId`) er bygget |
| GET/POST `/api/cron/cleanup-anonymous` | intern (`CRON_SECRET`) | | 200 `{ deletedSessions }`. Sletter `{case_id}/`-mapper og auth-brugeren | Bygget |
| GET/POST `/api/cron/complete-bookings` | intern (`CRON_SECRET`) | | 200 `{ completed, releasedHolds }` (10.10) | Bygget (6.1) |

**Tokens til appen** (2.4): har requesten `X-TandMatch-Client: mobile`, returnerer `POST /api/auth/login`, `POST /api/auth/signup` (kun `role: "patient"`; en klinik-signup fra appen giver 400 `VALIDATION_ERROR`), `POST /api/session/anonymous` (kun ved 201) og `POST /api/auth/convert` desuden `session: MobileSessionDto`, og der sættes ingen auth-cookies. Alle svar med tokens har `Cache-Control: no-store`. Adgangstokenet lever 3600 s; refresh-tokenet roterer med 10 s reuse-interval. `POST /api/auth/logout` med bearer tilbagekalder sessionen og svarer 204. Et ugyldigt eller udløbet bearer giver 401 `UNAUTHENTICATED` på alle routes med `createAuthContext()`, også hvis requesten har en cookie. `GET /api/me` virker med bearer som med cookie; appen afviser selv en konto med `role !== "patient"` ("Klinikker logger ind på weben").

```ts
// lib/identity/types/auth.ts
export type MobileSessionDto = { accessToken: string; refreshToken: string; expiresAt: string };  // expiresAt: ISO 8601

// lib/identity/constants/sessions.ts
export const MOBILE_CLIENT_HEADER = "X-TandMatch-Client";
export const MOBILE_CLIENT_VALUE = "mobile";
export const TERMS_TOKEN_HEADER = "X-Terms-Token";
```

IP-rate-limited (10 pr. time): login, signup og konvertering af anonym konto (`POST /api/auth/convert`, samme grænse som signup), anonym session, patienters billedupload og klinikkernes billedupload (10.8). Afsendelse af leads har 30 pr. time (`leads-send`, 10.5). Routes, som anonyme må kalde, kalder `touch_last_active()`.

### 10.3 Samtykker

Bygget (trin 0), inkl. `withdrawnLeads`. GET `/api/consents`, POST `/api/consents` (`{ type, textVersion }`; `health_data_sharing` kun permanent), POST `/api/consents/{id}/withdraw` (`{ withdrawnAt, deletedImages, withdrawnLeads, sessionDeleted }`). `withdrawnLeads` er antallet af leads, der blev trukket tilbage ved tilbagetrækning af `health_data_sharing` (5.3); UI fortæller, at bookede tider består og kan aflyses under Bookinger. `POST /api/consents` accepterer kun den gældende tekstversion for typen (`CONSENT_TEXT_VERSIONS`, 4.3), og fra migration `20261028000500` afviser databasen også en pensioneret version. Tilbagetrækning gælder alle aktive samtykker af typen (4.3, 5.3); svaret er uændret. UI'et for samtykker står i 6.2 (`/patient/samtykker`).
