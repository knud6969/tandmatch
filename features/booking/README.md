# Booking og anmeldelser (`features/booking`)

Domænet dækker bookinger, kalender, anmeldelser, prisnøjagtighed og moderation.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 4. Datamodel

### 4.3 Tabeller

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

## 10. API-kontrakter

### 10.10 Bookinger

```ts
// lib/booking/types/bookings.ts
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

Bygget i 6.1. Filer: `features/booking/bookingsController.ts` (`BookingsController`: `availabilityForLead`, `book`, `list`, `cancel`, `markNoShow`; rollen afgør patient- eller klinikvej), `features/booking/bookingsRepository.ts` (`book_slot`, `cancel_booking`, `mark_booking_no_show`, `patient_bookings`, `clinic_bookings`, `clinic_booking`, `complete_due_bookings`; mapper til DTO'erne og normaliserer tidspunkter til ISO med `Z`), `lib/schemas/{bookings,phone}.ts`, `lib/booking/domain/bookings.ts` (`canCancel`, `canMarkNoShow`, `canReview`, `graceEndsAt`, `pickLeadBooking`) og `lib/booking/constants/bookings.ts`. `CronController.completeBookings()` bruger `BookingsRepository` med service role-klienten. Ledige tider for et lead genbruger `AvailabilityService` (nye `resolveRange()` og `durationFor()`, som `ClinicDirectoryController` også bruger) og `ClinicDirectoryRepository.findClinic()`; der er ingen kopi af beregningen. Kontaktfelter til klinikken kommer kun fra `clinic_bookings()`, `clinic_booking()` og `clinic_lead_detail()` (5.5). `canCancel`, `canReview` og `canMarkNoShow` beregnes i TypeScript ud fra den effektive status fra databasen; databasen er vogteren (`cancel_booking()`, `mark_booking_no_show()`). `canReview` er kun sand ved effektivt `completed` (`ends_at + 24 t`) og hvis der ikke allerede er en anmeldelse (`patient_bookings().reviewed`). Fejlkoder ud over de generelle: `BOOKING_NOT_CANCELLABLE`, `CLINIC_NOT_AVAILABLE`, `BOOKING_LIMIT` (409), og `CLINIC_NOT_VERIFIED` (403) for en ikke-verificeret klinik. `PatientLeadDto.booking` er den aktive (`held`/`booked`) booking, ellers den nyeste (`pickLeadBooking()`); `CaseListItemDto.nextBooking` er sagens næste fremtidige `booked` tid. **Rettelser i 6.7a.** `book_slot()` har loftet `BOOKING_LIMIT` (`MAX_BOOKINGS_PER_LEAD = 5` i `lib/booking/constants/bookings.ts`, migration `20261027000100`); routen kalder `enforceIpRateLimit("booking", req, BOOKING_IP_LIMIT_PER_HOUR)` (30). Fejlene bygges af fabrikker i `platform/middleware/http.ts` (`conflict`, `leadNotAccepted`, `clinicNotAvailable`, `serviceNotOnCase`, `slotTaken`, `slotUnavailable`, `bookingLimit`, `bookingNotCancellable`, `noShowWindowClosed`, `reviewNotAllowed`, `alreadyReviewed`, `alreadyReplied`); tekster, som også views viser, står i `lib/common/constants/error-texts.ts`. `toClinicBookingDto()` og `ClinicBookingFields` ligger i `platform/db/mappers.ts` og giver kun `contact` ved `booked`/`completed` (security L1), så `LeadsRepository` ikke importerer `BookingsRepository`. `ClinicsRepository.requireOwnVerified()` erstatter de tre kopier af tjekket. `AvailabilityService.resolveRange(from, to, { defaultFrom, defaultDays, maxDays })` bruges også til klinikkens kalender. `phoneSchema` kræver mindst 8 cifre (`MIN_PHONE_DIGITS`, security L2). `MODERATION_LABEL` ligger i `lib/booking/constants/reviews.ts`. Tests: `features/booking/__tests__/api/bookings.test.ts`, `features/booking/__tests__/bookings.test.ts`, `platform/__tests__/mappersAndPhone.test.ts`, `tests/rls/47_booking_reads.sql`, `tests/rls/48_booking_limit.sql`.

### 10.13 Anmeldelser

Bygget i 6.2. `PublicReviewDto` er uændret; de øvrige typer ligger i `lib/booking/types/reviews.ts`.

```ts
export type PublicReviewDto = {
  id: string; stars: number; text: string; priceAccuracy: PriceAccuracy;
  actualPrice: number | null; lackedTransparency: boolean | null; transparencyComment: string | null;
  verifiedVisit: true;
  createdMonth: string;   // "YYYY-MM" i dansk tid; beregnes af toClinicMonth(created_at) (lib/common/domain/time.ts)
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

Filer: `features/booking/reviewsController.ts` (`ReviewsController`: `eligible`, `create`, `mine`, `listForClinic`, `reply`), `features/booking/reviewsRepository.ts` (`ReviewsRepository`: offentlig læsning og statistik, `create`, `listOwn`, `listOwnForExport`, `listForClinic`, `createReply`), `lib/booking/schemas/reviews.ts`, `lib/booking/domain/reviews.ts` (`priceEstimate`), `lib/booking/constants/reviews.ts` (længder), `toClinicDate()` i `lib/common/domain/time.ts` og `LeadsRepository.priceEstimates()`. Reglerne håndhæves af RLS-policyerne (8.1) og unique-nøglerne; controlleren genimplementerer dem ikke. `eligible` og `mine` bruger `BookingsRepository.listForPatient()` (klinikkens navn, `canReview`) i stedet for en ny funktion. Svaret på `mine` læser godkendte svar fra `public_reviews()`, fordi patienten ikke kan læse `review_replies`. Svar-routen tjekker først mod `clinic_reviews()` (404/409) og lader derefter policyen være vogter. Kendt begrænsning: `eligible` kan vise et besøg hos en klinik, der siden er blevet ikke-verificeret; `POST` giver da 403. Tests: `features/booking/__tests__/api/reviews.test.ts`, `features/booking/__tests__/reviews.test.ts`.
