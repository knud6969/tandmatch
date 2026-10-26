# Henvendelser (`features/leads`)

Domænet dækker leads, klinikkens indbakke, beskedtråde og akutvejen.

- **Server:** `*Controller.ts`, `*Repository.ts`/`*Storage.ts`, `*Service.ts` direkte i mappen.
- **Web-UI:** `components/`, `pages/` (som `app/` videresender til) og `utils/`.
- **Grænseflade:** andre domæner importerer kun `index.ts` (server) og `ui.ts` (klientsikre komponenter).
- **Tests:** `__tests__/` (unit) og `__tests__/api/` (API).

Afsnittene nedenfor er flyttet uændret fra `docs/architecture.md` (oversigten). Numrene er bevaret, så henvisninger som "architecture 10.10" i koden stadig kan findes. Stier er opdateret til den nye struktur.

## 4. Datamodel

### 4.3 Tabeller

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
| body | text not null | max 2000 tegn. Må være tom (`''`), når beskeden har mindst ét billede (`message_images`); en besked uden billeder skal have 1-2000 tegn (RLS-policyen ved direkte indsættelse og `send_message_with_images()`, migration `20261103000100`) |
| read_at | timestamptz null | |

#### `message_images` (billeder i beskedtråden, migration `20261103000100`)
| Felt | Type | Note |
|---|---|---|
| id | uuid PK | Også filnavnet i stien |
| message_id | uuid FK messages on delete cascade | Beskeden, billedet hører til |
| lead_id | uuid FK leads on delete cascade | Redundant (= beskedens lead), for enkel RLS og stien |
| position | smallint not null | 0-2, rækkefølgen i beskeden. `UNIQUE (message_id, position)` |
| consent_id | uuid null FK consents on delete cascade | Det `image_upload`-samtykke, der var aktivt, da **patienten** sendte billedet. `null` for klinikkens billeder (klinikken giver intet samtykke) |
| storage_path | text not null unique | `messages/{lead_id}/{id}.jpg` i den private bucket `case-images` (9.2). Check-constraint håndhæver formatet. Ingen `case_id` eller `patient_id` i stien |
| width, height, bytes | integer not null | Efter genkodning |
| created_at | timestamptz not null default now() | |

Højst `MESSAGE_MAX_IMAGES` (3) billeder pr. besked og `MESSAGE_IMAGES_MAX_PER_DAY` (30) pr. afsender pr. døgn (rullende 24 timer; `lib/common/constants/limits.ts`, samme tal i SQL). Rækker skrives **kun** af `send_message_with_images()` (service role, efter serverens tjek) og slettes kun via cascade, `withdraw_consent()` (patientens billeder ved tilbagetrækning af `image_upload`) eller kontosletning. Patienten læser sine tråde direkte (RLS `is_lead_patient(lead_id)`); klinikken har ingen SELECT og læser via `clinic_lead_message_images()` (5.7).

Tråden er åben, mens leadet er aktivt (`sent`, `accepted`, `booked`), så klinikken kan stille et afklarende spørgsmål før accept. Ved `declined` og `withdrawn` er den lukket for nye beskeder; eksisterende beskeder kan stadig læses af begge, undtagen at klinikken mister adgangen ved `withdrawn` (5.7). Kontakt går gennem tråden; platformen fjerner ikke kontaktoplysninger, som patienten selv skriver, men patientens profiloplysninger deles ikke før booking.

### 4.4 Hvad klinikken ser om patienten

| Tidspunkt | Klinikken ser | Klinikken ser aldrig |
|---|---|---|
| Lead `sent`/`accepted`/`declined` (og en `held` akuttid) | Bekræftede ydelser, godkendt opsummering (`summary_text`, `summary_ai_assisted`), godkendte billedbeskrivelser, billeder (kun med aktivt `image_upload`-samtykke), ønsket tidsrum, område (postnummer og by), afstand, listepris-snapshot, akutmarkering og ønsket akuttid | Navn, e-mail, telefon, `patient_id`, AI-chatten, andre klinikkers leads, om sagen er sendt til andre |
| Booking `booked` eller `completed` (effektiv status) | Det samme plus `contact_name`, `contact_phone` og `contact_email` **for den booking** | `patient_id`, AI-chatten |
| Booking `cancelled` eller `no_show` | Kontaktfelterne skjules igen | |
| Beskedtråden (lead ikke `withdrawn`) | Trådens beskeder og billeder, også dem patienten har vedhæftet i tråden (`message_images`) | `sender_id`, patientens profiloplysninger |
| Lead `withdrawn` | Kun at leadet er trukket tilbage, og hvornår | Alt sagsindhold, billeder, beskeder og beskedbilleder |

Klinikker har ingen SELECT-adgang til `cases`, `case_services`, `case_images`, `bookings`, `patients` eller `ai_*`. De læser kun via `clinic_*`-funktionerne (5.7), som aldrig returnerer `patient_id` og kun returnerer kontaktfelterne, når bookingens status er `booked` eller `completed`. Klinikker har heller ingen direkte SELECT på `leads` (migration `20261024000100`); status for et lead slås op med `clinic_lead_status()`.

**Accepteret i prototypen (security trin 5, M1):** den signerede billed-URL indeholder stien `{case_id}/{image_id}.jpg`, så to klinikker med samme sag i teorien kan se, at de har fået samme sag, ved at sammenligne URL'er. Ingen patientidentitet. Før rigtige patientdata: sti uden sags-id (9.2, ny migration).

---

## 5. Row Level Security

### 5.5 Isolation og skjulte kontaktoplysninger

- `leads` SELECT direkte har én vej ind: *du ejer sagen*. Klinikken læser kun sine egne leads via `clinic_*`-funktionerne og `clinic_lead_status()` (ejer, `verified`, `sent_at >= owner_since`), som aldrig returnerer `case_id`. At have et lead på samme sag giver **ikke** adgang til andre leads på sagen.
- `messages` læses af klinikker kun via `clinic_lead_messages()`, som kræver `is_lead_participant` (verificeret klinik, lead efter `owner_since`, ikke `withdrawn`) og aldrig returnerer `sender_id`.
- `message_images` læses af klinikker kun via `clinic_lead_message_images()` med samme regel (egen verificeret klinik via `is_my_clinic_lead`, ikke `withdrawn`). En anden klinik får ingen rækker, og stien indeholder kun leadets id, som klinikken i forvejen kender.
- Overtager en ny ejer en klinik (fx via CVR), ser den intet fra før `owner_since`: ingen leads, beskeder, bookinger eller kontaktoplysninger (5.1 regel 16).
- Ingen funktion, view eller route returnerer noget om andre leads på en sag til en klinik (fx antal, status, priser). `send_leads` returnerer kun antal til patienten.
- **Kontaktoplysninger** ligger kun i `bookings.contact_*` (og `patients.phone`, som kun patienten selv kan læse). Klinikken har ingen SELECT på `bookings` eller `patients`. `clinic_bookings()` og `clinic_lead_detail()` returnerer `contact_*` kun, når bookingen tilhører klinikken og har effektiv status `booked` eller `completed`. En reserveret akuttid (`held`) viser ingen kontakt, før klinikken har accepteret. Det er dermed databasen, ikke UI, der skjuler navn og kontakt.
- `patient_id` når aldrig klinikken: ikke i funktioner, ikke i storage-stier, ikke i DTO'er.
- AI-chatten er kun synlig for patienten.

### 5.7 Klinikkens læsevisninger

Alle kræver, at den kaldende ejer klinikken. Leads og bookinger kræver desuden `verified`.

Alle funktionerne returnerer kun leads med `sent_at >= clinics.owner_since` (og det, der hænger på dem). For leads med status `withdrawn` returnerer de kun id, status, `sent_at` og `withdrawn_at`; intet sagsindhold, ingen billeder, ingen beskeder. Beskeder læses via `clinic_lead_messages()` og markeres læst via `clinic_mark_messages_read()` (5.3).

- `clinic_leads(p_status)`: egne leads, evt. filtreret på status, med status, ydelsesnavne, område, afstand, ønsket tidsrum, akutmarkering, ønsket akuttid, antal billeder, `sent_at`, `seen_at`, ulæste beskeder. Ingen `patient_id`, ingen `case_id`. Fra migration `20261101000200_clinic_leads_overview` også `summary_excerpt` (de første 121 tegn af den godkendte `summary_text`, så serveren kan se, om den er afkortet), `list_price_min`/`list_price_max` (listepris-snapshot) og `hold_expires_at` (udløb for leadets reserverede akuttid, kun når den nyeste aktive booking har effektiv status `held`; samme booking-valg som `clinic_lead_detail()`). Alle tre er `null` for et tilbagetrukket lead. Ingen kontaktfelter (kontakt står kun i `clinic_lead_detail()` og `clinic_bookings()`, 5.5). RLS og adgangsreglen er uændrede (ejer, `verified`, `sent_at >= owner_since`).
- `clinic_lead_detail(lead_id)`: sagens godkendte indhold (ydelser, `summary_text`, `summary_ai_assisted`, ønsket tidsrum, område, akut), listepris-snapshot, egen beslutning, antal ulæste beskeder fra patienten (`unread_messages`, migration `20261025000100`) og den aktive eller seneste booking med `contact_*` efter reglen i 5.5.
- `clinic_leads()` sorterer ubesvarede først, derefter akut (kun for leads, der ikke er trukket tilbage, så rækkefølgen ikke afslører akut-status for et tilbagetrukket lead; migration `20261025000100`), derefter nyeste.
- `clinic_lead_images(lead_id)`: billedstier og godkendte beskrivelser, kun med aktivt `image_upload`-samtykke. Serveren signerer stierne (9.2).
- `clinic_lead_message_images(lead_id)`: trådens billeder (`id`, `message_id`, `position`, `storage_path`, `width`, `height`), kun for egen verificeret klinik og aldrig for et `withdrawn` lead. Serveren signerer stierne (9.2). Migration `20261103000100`.
- `clinic_bookings(from, to)`: kalenderen: egne bookinger med ydelse, tider, status, `lead_id` og `contact_*` efter reglen i 5.5.
- `clinic_booking(p_booking_id)`: én af klinikkens egne bookinger med samme kolonner og regler som `clinic_bookings()` (bruges til svaret efter aflysning og udeblivelse; migration `20261026000100`). En anden klinik får ingen række.
- `clinic_reviews()`: godkendte anmeldelser af egen klinik + eget svar og dets status.

---

## 10. API-kontrakter

### 10.9 Leads

```ts
// lib/leads/types/leads.ts
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
  // Fra 2026-10-24 (migration 20261101000200), til indbakkens række og akut-fristen:
  summaryExcerpt: string;              // højst 120 tegn af den godkendte opsummering, afkortet ved et ord med "…"; "" ved withdrawn
  listPrice: PriceRange | null;        // listepris-snapshot (flyttet hertil fra ClinicLeadDetailDto, som arver det)
  holdExpiresAt: string | null;        // "Svar inden kl. HH:MM": udløb for en reserveret akuttid (kun effektiv status held)
};

export type ClinicLeadDetailDto = ClinicLeadListItemDto & {
  services: Pick<ServiceDto, "id" | "slug" | "name" | "description" | "category">[];  // det clinic_lead_detail() returnerer
  summaryText: string; summaryAiAssisted: boolean;
  // view og quality er null (AI'ens billedvurdering deles ikke med klinikken); description = approvedDescription, som kan være null
  images: (ImageDto & { approvedDescription: string | null })[];
  decision: { comment: string | null; quotedPrice: PriceRange | null; declineReason: LeadDeclineReason | null; declineNote: string | null; respondedAt: string } | null;
  booking: ClinicBookingDto | null;
};
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads` | klinik (verificeret) | `?status=` (valgfri `LeadStatus`) | `{ leads: ClinicLeadListItemDto[] }` (`clinic_leads(p_status)`) |
| GET `/api/leads/{id}` | klinik (ejer) | | `ClinicLeadDetailDto`. Sætter `seen_at` via `clinic_mark_lead_seen()` (pragmatisk sideeffekt) |
| POST `/api/leads/{id}/decision` | klinik (ejer, verificeret) | `{ decision: "accept", comment?, quotedPriceMin?, quotedPriceMax? }` eller `{ decision: "decline", reason (alle undtagen "clinic_left"), note? }` | `ClinicLeadDetailDto`; 409 hvis ikke `sent` (fx trukket tilbage). Accept af akut-lead inden for reservationen gør tiden til en booking; efter udløb bliver leadet `accepted` uden booking, og patienten booker selv |

`unreadMessages` på `GET /api/leads/{id}` kommer fra `clinic_lead_detail()` (ét kald pr. RPC, 2.1). `summaryExcerpt` beregnes i `LeadsRepository` med `summaryExcerpt()` (`lib/leads/domain/leads.ts`, ren funktion) fra `summary_excerpt` i listen og fra `summary_text` i detaljen; `holdExpiresAt` er i detaljen det samme som `booking.holdExpiresAt`. **Kræver handling** (klinikkens standardfilter og tallet på fanen, 6.3) = `leadNeedsAction(lead)`: status `sent` eller `unreadMessages > 0`, aldrig `withdrawn`; beregnes i klienten af listen, intet eget endpoint. For et lead med status `withdrawn` returnerer `GET /api/leads` og `GET /api/leads/{id}` kun `id`, `status`, `sentAt` og `withdrawnAt`; øvrige felter er tomme værdier (`false`, `[]`, `null`, `0`, `""`) (5.7).

Bygget i 5.1: `LeadsController` (`listForClinic`, `getForClinic`, `decide`) og `LeadsRepository`. En ikke-verificeret klinik får 403 `CLINIC_NOT_VERIFIED` på alle tre routes; ukendt eller fremmed lead giver 404, beslutning på et lead, der ikke er `sent`, 409 `LEAD_NOT_PENDING`. `GET /api/leads/{id}` sætter `seen_at` før detaljen læses. `ClinicBookingDto` og `BookingStatus` ligger i `lib/booking/types/bookings.ts`, som blev udvidet i 6.1 (10.10).

Patienten læser sine leads via `GET /api/cases/{id}/leads` (10.5).

### 10.11 Akutvej

Bygget i 7.3 (API'et) og 7.4 (siden `/akut`, 6.1).

```ts
// lib/leads/schemas/leads.ts (zod 4)
export const emergencyLeadSchema = z.object({
  clinicId: z.uuid(),
  serviceId: z.uuid(),                        // skal være en aktiv ydelse med kategori "emergency" (tjekkes i databasen)
  startsAt: z.iso.datetime({ offset: true }), // en af tiderne fra GET /api/clinics/{id}/availability
  description: z.string().trim().min(10).max(1000),   // EMERGENCY_DESCRIPTION_MIN/MAX i lib/leads/constants/leads.ts
  contactName: contactNameSchema,             // samme som bookingen (2-100)
  contactPhone: phoneSchema,                  // mindst 8 cifre
  postalCode: postalCodeSchema.optional(),    // ellers patientens postnummer
}).strict();

// lib/leads/types/leads.ts
export type EmergencyLeadCreatedDto = { caseId: string; lead: PatientLeadDto };   // lead.booking.status === "held"
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| POST `/api/emergency-leads` | patient med konto (anonyme: 403 `ACCOUNT_REQUIRED`), gældende `health_data_sharing` (4.3) | `emergencyLeadSchema` | 201 `EmergencyLeadCreatedDto` med `lead.booking.status = "held"` og `holdExpiresAt`. Kalder `send_emergency_lead()` (5.3), som i én transaktion opretter sagen (`is_emergency`, `summary_text = description` godkendt af patienten, ydelsen bekræftet) og kalder `send_leads(…, requested_*, contact_*)`, der reserverer tiden. 400 `VALIDATION_ERROR` (også ugyldig kontakt), 400 `UNKNOWN_SERVICE` (ikke en aktiv akutydelse), 400 `UNKNOWN_POSTAL_CODE`; 403 `ACCOUNT_REQUIRED`, `CONSENT_REQUIRED`; 409 `SLOT_TAKEN`, `SLOT_UNAVAILABLE`, `CLINIC_NOT_AVAILABLE`; 429 `LEAD_DAILY_LIMIT`, `RATE_LIMITED` (`enforceIpRateLimit("leads-send", req, LEADS_SEND_IP_LIMIT_PER_HOUR)`) |

Lag: `app/api/emergency-leads/route.ts` → `new LeadsController(gate.supabase, session).sendEmergency(input)` → `ConsentsRepository.requireCurrentActive("health_data_sharing", …)` (ellers 403; 4.3) → `LeadsRepository.sendEmergency(input)` (ét RPC-kald, fejlkoderne oversættes i repositoriet med de eksisterende fabrikker i `platform/middleware/http.ts`) → `PatientLeadDto` bygges som i `listForCase` (samme mapper, `BookingsRepository.currentByLead()`), ingen kopi. Ingen ny controller. Efter afsendelsen følger leadet de almindelige regler: klinikken accepterer (tiden bliver `booked`) eller afviser (tiden frigives), patienten kan trække det tilbage (10.5), og efter udløb bliver en accept til `accepted` uden booking (10.9).

### 10.12 Beskeder

```ts
// lib/leads/types/messages.ts
export type MessageImageDto = { id: string; url: string; width: number; height: number };   // url: signeret, 5 min
export type MessageDto = { id: string; fromMe: boolean; senderRole: MessageSenderRole; body: string;   // body kan være "" ved et rent billede
                           createdAt: string; readAt: string | null; images: MessageImageDto[] };      // images i rækkefølge (position)
```

| Metode og route | Rolle | Input | Output |
|---|---|---|---|
| GET `/api/leads/{id}/messages` | deltager | | `{ messages: MessageDto[] }` (markerer modtagne som læst). Patient: direkte læsning og `read_at`-opdatering med RLS, billeder fra `message_images` med RLS. Klinik: `clinic_lead_messages()`, `clinic_lead_message_images()` og `clinic_mark_messages_read()` |
| POST `/api/leads/{id}/messages` | deltager, lead `sent`/`accepted`/`booked` | JSON `{ body }` (1-2000) **eller** `multipart/form-data` med `file` 1-3 gange (`MESSAGE_MAX_IMAGES`) og valgfrit tekstfelt `body` (0-2000) | 201 `MessageDto`; 409 `THREAD_CLOSED` ved `declined`/`withdrawn` |

`MessageDto = { id, fromMe, senderRole, body, createdAt, readAt, images }` (`senderRole` viser "Klinikken", også når afsenderen er slettet). GET læser først og markerer derefter modtagne som læst, så svaret viser, hvad der var nyt; klinikken får en tom liste ved `withdrawn`. POST: 429 `MESSAGE_LIMIT` ved døgnloftet (200). Anonyme og admin får 403. Bygget i 5.2 (`MessagesController`, `MessagesRepository`, `lib/{types,schemas,constants}/messages.ts`). Polling hvert 15. sekund på åben tråd. Klinikkens statusopslag (åben eller lukket tråd) går via `clinic_lead_status()`, ikke direkte på `leads` (5.5; migration `20261024000100`). Afvises en indsættelse af RLS, kaster `MessagesRepository` en navngiven fejl, og `MessagesController` slår status op igen via `LeadsRepository` (repositories ejer ikke hinanden, 2.1.1): lukket tråd giver 409 `THREAD_CLOSED`, ellers 429 `MESSAGE_LIMIT`. Indsættelsen returnerer kun kolonnerne i `MessageDto` (ingen `sender_id`). Patienten får rækken direkte fra insert; klinikken har ingen SELECT på `messages`, så den indsatte besked hentes via `clinic_lead_messages()` (hele tråden; acceptabelt i prototypen). Beskedroutene kræver `requireRole(["patient", "clinic"])`.

**Billeder i beskeder** (besluttet og bygget 2026-10-26, migration `20261103000100`). Både patient og klinik kan vedhæfte op til 3 billeder pr. besked; teksten er valgfri, når der er mindst ét billede. Billederne er helbredsdata (GDPR art. 9).
- **Upload-flow (multipart):** routen kræver `Content-Length` (411 `LENGTH_REQUIRED`) og højst `MESSAGE_MAX_IMAGES × MAX_IMAGE_UPLOAD_BYTES` (+64 KB) (413 `FILE_TOO_LARGE`) og har IP-grænsen `enforceIpRateLimit("message-image-upload", req)` (10 pr. time, som øvrige billeduploads; 429 `RATE_LIMITED`). Controlleren tjekker i rækkefølge: deltager (404), åben tråd (409 `THREAD_CLOSED`), døgnloftet for beskeder (429 `MESSAGE_LIMIT`) og for **patienten** det gældende `image_upload`-samtykke med `ConsentsRepository.requireCurrentActive()` (403 `CONSENT_REQUIRED`; samme samtykke som i AI-chatten, 9.4). Klinikken behøver intet samtykke. Først derefter læses formularen (`imagesFormReader` i `platform/middleware/http.ts`): 400 `MISSING_FILE` uden billede, 400 `IMAGE_LIMIT` ved flere end 3, 400 `VALIDATION_ERROR` ved for lang tekst, 400 `INVALID_IMAGE` ved forkert filtype (magic bytes: JPEG, PNG, HEIC), 413 `FILE_TOO_LARGE`. Hvert billede genkodes med `ImageProcessingService` (sharp: JPEG, EXIF fjernes, maks. 2048 px).
- **Lagring:** filerne skrives med service role til `case-images` under `messages/{lead_id}/{image_id}.jpg` (`MessageImageStorage`, 2.3 c), og derefter indsætter `send_message_with_images(p_user_id, p_lead_id, p_message_id, p_body, p_images)` (kun service role, 5.3) beskeden og billedrækkerne i én transaktion. Funktionen tjekker selv deltager, permanent konto, åben tråd, døgnlofterne (200 beskeder, 30 billeder; 429 `MESSAGE_LIMIT`/`MESSAGE_IMAGE_LIMIT`) og for patienten det gældende `image_upload`-samtykke, som gemmes i `consent_id`. Fejler indsættelsen, slettes de uploadede filer igen.
- **Læsning:** stierne hentes altid gennem en RLS-beskyttet læsning (patient: `message_images` med RLS; klinik: `clinic_lead_message_images()`), og først derefter signerer serveren dem med service role (TTL 5 min, 2.3 e). Signerede URL'er logges ikke. Ved `withdrawn` ser klinikken hverken beskeder eller billeder.
- **Sletning:** rækkerne følger beskeden og leadet (cascade). Tilbagetrækning af `image_upload` sletter **patientens** beskedbilleder (rækker i `withdraw_consent()`, filer via `deleted_image_paths` som sagsbillederne); beskedteksten bliver stående, og en besked uden tekst og billeder vises som "Billedet er slettet". Kontosletning af patienten sletter mapperne `messages/{lead_id}/` for alle patientens leads (`AccountDeletionService`) og rækkerne via cascade. Slettes klinikkontoen, bevares klinikkens billeder i patientens tråd ligesom beskederne (12.3 punkt 30). Anonyme har ingen leads, så oprydningsjobbet for anonyme berøres ikke.
- **Klienterne:** weben (`message-thread.tsx`) har en knap "Vedhæft billeder", forhåndsvisning med fjern-knap før afsendelse, miniaturer i boblerne og stort billede i en lightbox (`image-lightbox.tsx`, delt med `lead-images.tsx`). Appen genbruger chattens billedvælger (kamera/bibliotek, nedskalering) og samtykkekort (`ConsentGate`), sender multipart som færdigbyggede bytes (`buildMultipartParts`, fordi `expo/fetch` ikke understøtter `{ uri }`-FormData) og viser miniaturer i boblerne og billedet i fuld skærm ved tryk. Begge beholder en signeret URL pr. billede i op til 4 minutter på tværs af polling (`keepImageUrls()`, `lib/leads/domain/messages.ts`), så billederne ikke hentes igen hvert 15. sekund.
