// Booking og ledige tider (architecture 6.7, 7.6). Værdierne markeret (SQL) spejler databasen og skal være ens begge
// steder: assert_slot_bookable(), effective_booking_status(), send_leads() og mark_booking_no_show() i
// supabase/migrations/20261012000800_bookings.sql og book_slot() i 20261027000100_booking_limit.sql. Ændres altid begge steder i samme commit.

// Bookingens status (SQL: enum booking_status, architecture 4.2). Altid den effektive status, når den vises.
export const BOOKING_STATUSES = ["held", "booked", "completed", "no_show", "cancelled"] as const;

// Tidszonen for åbningstider og starttider (SQL: 'Europe/Copenhagen').
export const CLINIC_TIME_ZONE = "Europe/Copenhagen";

export const SLOT_STEP_MINUTES = 15; // (SQL) starttid på helt kvarter, lokal tid
export const MIN_BOOKING_NOTICE_MIN = 30; // (SQL) mindste varsel, almindelig ydelse
export const MIN_EMERGENCY_NOTICE_MIN = 0; // (SQL) mindste varsel, akutydelse
export const BOOKING_HORIZON_DAYS = 60; // (SQL) længst frem at booke
export const NO_SHOW_GRACE_HOURS = 24; // (SQL) frist for udeblivelse efter sluttid
export const EMERGENCY_HOLD_MINUTES = 30; // (SQL) reservation af akuttid uden svar (eller til starttid)
export const MAX_BOOKINGS_PER_LEAD = 5; // (SQL) højst så mange bookinger i alt pr. lead, også aflyste, men ikke dem klinikken har aflyst (cancelled_by = 'clinic'; book_slot(), BOOKING_LIMIT)

// Hvem der kan aflyse en booking (SQL: bookings.cancelled_by, architecture 4.3).
export const BOOKING_ACTORS = ["patient", "clinic"] as const;

// Kun TypeScript (visning): "første ledige tid" søges så langt frem, og ledige tider hentes højst så mange dage pr. kald.
export const FIRST_AVAILABLE_SEARCH_DAYS = 14;
export const MAX_AVAILABILITY_RANGE_DAYS = 14;

// Klinikkens kalender (GET /api/bookings): uden ?from=&to= vises bookinger fra så mange dage tilbage (så en udeblivelse kan
// registreres) og BOOKING_HORIZON_DAYS frem. Højst så mange dage pr. kald.
export const CLINIC_BOOKINGS_DEFAULT_PAST_DAYS = 7;
export const MAX_BOOKINGS_RANGE_DAYS = 92;

// Kontaktnavn ved booking (SQL: book_slot() og bookings.contact_name, 2-100 tegn).
export const CONTACT_NAME_MIN_CHARS = 2;
export const CONTACT_NAME_MAX_CHARS = 100;

// Danske navne til bookingens status (architecture 4.2, 10.10).
export const BOOKING_STATUS_LABEL = {
  held: "Reserveret",
  booked: "Booket",
  completed: "Gennemført",
  no_show: "Udeblevet",
  cancelled: "Aflyst",
} as const satisfies Record<(typeof BOOKING_STATUSES)[number], string>;

// Klinikkens valgfri grund ved aflysning (SQL: bookings.cancel_reason og cancel_booking(), højst 200 tegn).
export const CANCEL_REASON_MAX_CHARS = 200;
export const CANCEL_REASON_INVALID = `Grunden må højst være ${CANCEL_REASON_MAX_CHARS} tegn, og kun klinikken kan skrive en grund.`;

// Hvem der aflyste, som klinikken ser det i kalenderen (10.10).
export const CLINIC_CANCELLED_BY_LABEL = {
  patient: "Aflyst af patienten",
  clinic: "Aflyst af klinikken",
  system: "Reservationen udløb",
} as const;

// Hvem der aflyste, som patienten ser det i appen (10.10). Har klinikken skrevet en grund, vises "Klinikken aflyste: <grund>".
export const PATIENT_CANCELLED_BY_LABEL = {
  patient: "Du aflyste tiden",
  clinic: "Aflyst af klinikken",
  system: "Reservationen udløb",
} as const;
export const CLINIC_CANCEL_REASON_PREFIX = "Klinikken aflyste:";

// Konsekvensen af at aflyse en booking, som patienten ser før bekræftelsen. Klinikken får ingen notifikation.
export const CANCEL_BOOKING_CONSEQUENCE = "Tiden frigives, og klinikken ser aflysningen i sin kalender. Du kan booke en ny tid, hvis henvendelsen stadig er åben.";
