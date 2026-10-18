// Booking og ledige tider (architecture 6.7, 7.6). Værdierne markeret (SQL) spejler databasen og skal være ens begge
// steder: assert_slot_bookable(), effective_booking_status(), send_leads() og mark_booking_no_show() i
// supabase/migrations/20261012000800_bookings.sql. Ændres altid begge steder i samme commit.

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
