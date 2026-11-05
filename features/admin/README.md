# Admin (`features/admin`)

**Bygget (2026-11-04)** i trin 11, PR C (`docs/arbejdsplan.md`); review, security og test mangler. Domænet dækker admins sider på weben: klinikkernes status og moderation af anmeldelser og klinikkers svar. Rollen `admin` og `is_admin()` findes allerede (identity 3, platform 5.2).

- **Server:** `*Controller.ts`, `*Repository.ts`, direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/admin/**` videresender til).
- **Grænseflade:** `index.ts` (tom i starten; ingen andre domæner bruger admin) og `ui.ts` (tom). Afvigelse: `features/booking/ui.ts` eksporterer også `MODERATION_TONE` (`utils/review-status.ts`), så adminsiden genbruger tonerne i stedet for at kopiere dem. Controllerne tjekker `session.role === "admin"` i constructoren (forsvar i dybden).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).
- **Lint:** `admin` tilføjes til `DOMAINS` i `eslint.config.mjs`, så domænegrænserne (architecture 2.1) også gælder her.

Afsnitsnumrene følger oversigten (`docs/architecture.md` 0.2). 6.4 og 10.14 er flyttet hertil fra `platform/README.md`.

**Hvorfor et eget domæne:** admin-funktionerne bruger egne RPC'er og egne læsninger med andre kolonner end klinik- og bookingdomænet (fx CVR og ejerstatus, anmeldelser i alle statusser). Et eget domæne holder `features/clinics` og `features/booking` uændrede og samler adgangsreglen ét sted. Delte labels genbruges fra `lib/` (`CLINIC_STATUS_LABEL` i `lib/clinics/constants/`, `MODERATION_LABEL` i `lib/booking/constants/reviews.ts`); ingen kopier.

## 3. Hvad admin må

Uændret fra identity 3: admin ser og ændrer klinikstatus og modererer anmeldelser og svar. Admin har **ingen** adgang til sager, chat, billeder, leads, bookinger, beskeder, notifikationer eller push-tokens (dataminimering), og ingen DTO til admin indeholder `patient_id`, patientens navn eller kontaktoplysninger. **Fra migration `20261110000200` (security M1) har admin ingen direkte læseadgang til `reviews`, `review_replies`, `profiles` og `terms_acceptances`:** `is_admin()` er fjernet fra deres SELECT-policyer. Anmeldelser og svar læses gennem `admin_reviews()` og `admin_review_replies()` (5.3), som aldrig returnerer `patient_id`, `booking_id` eller patientnavn, og ejerens e-mail gennem `admin_clinic_owners()`. Admin læser stadig `clinics` direkte (virksomhedsdata; `clinics_guard()` bruger `is_admin()`). Alle skrivninger sker via `security definer`-funktioner, der selv tjekker `is_admin()`; UI og API er ikke grænsen.

**Oprettelse af en admin** (gøres af brugeren): `npm run admin:create -- --email <e-mail>` (`scripts/create-admin.ts`, service role, 2.3 h) opretter en bruger med en tilfældig adgangskode og `role = 'patient'` i metadata (signup-triggeren accepterer kun `patient`/`clinic`), sætter derefter `profiles.role = 'admin'` og sletter `patients`-rækken, og udskriver kun, at det lykkedes (adgangskoden sættes via "Glemt adgangskode" på `/login`). Scriptet bruger miljøet i `.env.test.local` (lokal Supabase) og nægter en ikke-lokal URL uden `--allow-remote` (samme vagt som seed-scriptet, `readConfig()`); mod et fælles projekt køres det med det ønskede miljø og `--allow-remote`. Eksisterende e-mail giver en fejl.

## 4. Datamodel

### 4.3 Tabeller

#### `admin_actions` (log over admins handlinger)

Migration `20261107000200_admin.sql`.

| Felt | Type | Note |
|---|---|---|
| id | uuid PK | |
| admin_id | uuid null FK profiles on delete set null | Hvem |
| action | text not null | `clinic_status`, `moderate_review` eller `moderate_reply` (check) |
| target_id | uuid not null | Klinik-, anmeldelses- eller svar-id |
| from_value, to_value | text not null | Status før og efter |
| reason | text null | Højst 500 tegn |
| created_at | timestamptz not null default now() | |

RLS: SELECT kun `is_admin()`; ingen INSERT, UPDATE eller DELETE for klientroller (platform 5.4). Rækker skrives kun af funktionerne i 5.3.

## 5. Row Level Security

### 5.3 Funktioner

| Funktion | Kaldes af | Gør |
|---|---|---|
| `admin_change_clinic_status(p_clinic_id uuid, p_status clinic_status, p_reason text default null)` | admin (`is_admin()` og `is_permanent_user()`, ellers `42501`) | Tilladte overgange: `registered → verified` ("Verificér") og `verified → registered` ("Sæt på pause"). Alt andet (fx `imported`, `removed`, samme status) giver `INVALID_STATUS_TRANSITION`; ukendt klinik `NOT_FOUND`; begrundelse over 500 tegn `22023`. Kalder internt `admin_set_clinic_status()` (som sætter transaktionsflaget, som `clinics_guard()` kræver, og `verified_at`), skriver én række i `admin_actions` og returnerer den nye status. `security definer`, `search_path = ''`, kun `authenticated` |
| `admin_moderate(p_kind text, p_id uuid, p_status moderation_status, p_reason text default null)` | admin (som ovenfor) | `p_kind` er `review` eller `reply`. `p_status` er `approved` eller `rejected` (ikke `pending`). `rejected` kræver en begrundelse på 1-500 tegn (ellers `REASON_REQUIRED`). Sætter `moderation_status`, `moderated_by = auth.uid()`, `moderated_at = now()` og `rejection_reason` (`null` ved godkendelse). Også en godkendt anmeldelse kan afvises (fjernes fra offentligheden) og omvendt. Skriver én række i `admin_actions`. Ukendt id `NOT_FOUND`. Erstatter den aldrig byggede `moderate()` (platform 5.3) |

Læsefunktioner (migration `20261110000200`; alle `security definer`, `search_path = ''`, kalder `assert_admin()`, kun `authenticated`):

| Funktion | Returnerer |
|---|---|
| `admin_reviews(p_status moderation_status default null, p_id uuid default null)` | Anmeldelser (filtreret på status og/eller id; `null` = alle), ældste først, højst 200: `id`, `created_at`, `clinic_id`, `clinic_name`, `moderation_status`, `rejection_reason`, `moderated_at`, `stars`, `text`, `price_accuracy`, `actual_price`, `lacked_transparency`, `transparency_comment`. **Aldrig `patient_id` eller `booking_id`** |
| `admin_review_replies(p_status moderation_status default null, p_id uuid default null)` | Klinikkers svar (samme filtre), med klinik, `review_id` og anmeldelsens tekst (afkortes i appen til højst 200 tegn) |
| `admin_clinic_owners(p_clinic_ids uuid[])` | `clinic_id` og `owner_email` (fra `auth.users`) for klinikker med en ejer, højst 200 id'er. Bruges til at vise ejerens e-mail på `/admin/klinikker` |

`admin_change_clinic_status()` kræver en begrundelse på 1-500 tegn ved `registered -> verified` (`REASON_REQUIRED`); ved `verified -> registered` er den valgfri. Automatisk verificering af nye klinikker (`20261102000100`) er uændret i demoen; den skal slås fra, og ejerskab dokumenteres, før rigtige brugere (`docs/security.md`, kompromis 30).

Læsning af klinikker sker med den eksisterende policy (`is_admin()` på `clinics`). Repositories vælger eksplicitte kolonner og får aldrig `patient_id`.

Notifikationer om moderation (fx til klinikken ved en ny godkendt anmeldelse) er [UDSKUDT].

### 5.6 Tests

Platform 5.6 punkt 60 (fil `tests/rls/65_admin.sql`).

## 6. Sider og routes

### 6.4 Admin (`/admin`, rolle `admin`)

`app/admin/layout.tsx` kalder `guardArea("admin", …)` (platform 6.5; `proxy.ts` sender allerede `/admin/*` uden session til `/login`). `AREA_HOME.admin = "/admin/moderation"` og `AREA_NAV.admin = [{ href: "/admin/moderation", label: "Moderation" }, { href: "/admin/klinikker", label: "Klinikker" }]` i `lib/common/navigation/areas.ts`. `/admin` omdirigerer til `/admin/moderation`. Samme layout, header og farver som klinik-weben; tjekkes ved 390 og 1280 px. Teksterne står i `lib/admin/constants/admin.ts` (ny mappe efter mønstret `lib/<domæne>/`).

| Route | Indhold |
|---|---|
| `/admin/moderation` | To faner: **Anmeldelser** og **Klinikkers svar**. Filter: **Afventer** (standard), Godkendt, Afvist. Ét kort pr. element, ældste først: klinikkens navn, dato, for anmeldelser stjerner, tekst, prisnøjagtighed, evt. faktisk pris og gennemsigtighedskommentar; for svar svarets tekst og et uddrag af anmeldelsen (højst 200 tegn). Knapperne "Godkend" og "Afvis". "Afvis" åbner et felt til begrundelsen med fire hurtigvalg (`MODERATION_REJECTION_REASONS`, defineret i `lib/booking/constants/reviews.ts` og genbrugt via `lib/admin/constants/admin.ts`: "Personoplysninger om andre", "Injurierende indhold", "Helbredsoplysninger om andre", "Irrelevant indhold", 8.5) og fri tekst; begrundelsen gemmes (`rejection_reason` og `admin_actions`) men vises endnu hverken for patienten eller klinikken. Efter en handling forsvinder kortet fra filteret med kvitteringen "Godkendt" / "Afvist". Tom kø: "Der er intet at moderere." Ingen patientnavne eller -id'er |
| `/admin/klinikker` | Søgefelt (navn, by eller CVR) og filter på status (Alle, Verificeret, Oprettet, Importeret, Fjernet; labels fra `CLINIC_STATUS_LABEL`). Tabel/liste: navn, postnummer og by, CVR, status, "har konto" (ja/nej), verificeret dato. Hver række viser ejerens e-mail (eller "Ingen konto"). Handlinger: "Verificér" (kun `registered`) og "Sæt på pause" (kun `verified`). Begge kræver bekræftelse; **"Verificér" kræver en begrundelse** (fx hvordan ejerskabet er kontrolleret), "Sæt på pause" har en valgfri; "Sæt på pause" viser konsekvensen (`CLINIC_PAUSE_CONSEQUENCE`): "Klinikken forsvinder fra oversigten og kan hverken modtage eller se henvendelser og bookinger, før den bliver verificeret igen. Patienternes henvendelser bliver liggende." Højst 200 rækker; ingen sidevisning [PROTOTYPE] |

## 10. API-kontrakter

### 10.14 Admin

Alle routes: `requireTerms()` og `requireRole(["admin"])`; andre roller får 403 `FORBIDDEN`, anonyme 403 `FORBIDDEN` (rollen tjekkes før anonym-tjekket; anonyme har rollen patient), uden session 401. Ingen service role.

```ts
// lib/admin/types/admin.ts
export type AdminClinicDto = {
  id: string; name: string; postalCode: string; city: string; cvr: string | null;
  status: ClinicStatus; hasOwner: boolean; ownerEmail: string | null; verifiedAt: string | null; createdAt: string;
  canVerify: boolean; canPause: boolean;      // status === "registered" / "verified"
};
type ModerationBase = {
  id: string; clinic: { id: string; name: string }; createdAt: string;
  moderationStatus: ModerationStatus; rejectionReason: string | null; moderatedAt: string | null;
};
export type AdminModerationItemDto =
  | (ModerationBase & { kind: "review"; stars: number; text: string; priceAccuracy: PriceAccuracy;
      actualPrice: number | null; lackedTransparency: boolean | null; transparencyComment: string | null })
  | (ModerationBase & { kind: "reply"; reviewId: string; text: string; reviewExcerpt: string });
// lib/admin/schemas/admin.ts
export const adminClinicsQuerySchema = z.object({ status: z.enum(CLINIC_STATUSES).optional(), q: z.string().trim().max(100).optional() });
export const adminClinicStatusSchema = z.object({ status: z.enum(["verified", "registered"]), reason: z.string().trim().max(500).optional() }).strict()
  // + refine: reason er påkrævet (min 1), når status er "verified" (400 REASON_REQUIRED)
;
export const adminModerationQuerySchema = z.object({ kind: z.enum(["review", "reply"]).default("review"), status: z.enum(MODERATION_STATUSES).default("pending") });
export const adminModerateSchema = z.object({ status: z.enum(["approved", "rejected"]), reason: z.string().trim().min(1).max(500).optional() }).strict();
```

| Metode og route | Input | Output |
|---|---|---|
| GET `/api/admin/clinics` | `adminClinicsQuerySchema` | 200 `{ clinics: AdminClinicDto[] }`, sorteret efter navn, højst 200. 400 `VALIDATION_ERROR` |
| POST `/api/admin/clinics/{id}/status` | `adminClinicStatusSchema` | 200 `AdminClinicDto`. 400 `VALIDATION_ERROR`; 404; 409 `INVALID_STATUS_TRANSITION` |
| GET `/api/admin/moderation` | `adminModerationQuerySchema` | 200 `{ items: AdminModerationItemDto[] }`, ældste først, højst 200 |
| POST `/api/admin/moderation/{kind}/{id}` | `adminModerateSchema`; `kind` er `review` eller `reply` i stien | 200 `AdminModerationItemDto`. 400 `VALIDATION_ERROR`, 400 `REASON_REQUIRED` (afvisning uden begrundelse); 404 |

Lag: `app/api/admin/**/route.ts` → `AdminClinicsController` (`list`, `changeStatus`) og `AdminModerationController` (`list`, `moderate`) med `(supabase, session, deps)` (2.1.1) → `AdminClinicsRepository` og `AdminModerationRepository` (arver `BaseRepository`). Fejlkoderne `INVALID_STATUS_TRANSITION` og `REASON_REQUIRED` og deres danske tekster står i `lib/common/constants/error-texts.ts`; fabrikkerne i `platform/middleware/http.ts`.

**Tests:** RLS platform 5.6 punkt 60. API `features/admin/__tests__/api/admin.test.ts`: patient og klinik 403; admin ser klinikker og en `pending` anmeldelse; godkendelse gør anmeldelsen synlig i `GET /api/clinics/{id}/reviews`; afvisning uden begrundelse 400; "Sæt på pause" gør klinikken usynlig i `GET /api/clinics`; ugyldig overgang 409. E2e `tests/e2e/admin.spec.ts` (390 og 1280 px): admin logger ind, godkender en anmeldelse og sætter en klinik på pause.
