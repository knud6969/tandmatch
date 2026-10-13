// Klinikker (architecture 4.2, 4.3, 5.1). Værdierne skal svare til enum clinic_status og check constraints i databasen.
export const CLINIC_STATUSES = ["imported", "registered", "verified"] as const;

// Danske visningsnavne. `registered` vises kun for klinikken selv; offentligheden ser den som `imported` (5.1 regel 11).
export const CLINIC_STATUS_LABEL = {
  imported: "Ikke oprettet",
  registered: "Oprettet, afventer verificering",
  verified: "Verificeret",
} as const satisfies Record<(typeof CLINIC_STATUSES)[number], string>;

// Hvem der har indtastet Trustpilot-data (architecture 4.3 `trustpilot_entered_by`, 8.4). Trustpilot scrapes aldrig.
export const TRUSTPILOT_ENTERED_BY = ["clinic", "admin"] as const;
export const TRUSTPILOT_URL_PREFIXES = ["https://dk.trustpilot.com/", "https://www.trustpilot.com/"] as const;

// Grænser (SQL: check constraints på clinics, clinic_prices, clinic_opening_hours, clinic_time_blocks).
export const CLINIC_DESCRIPTION_MAX_CHARS = 1000;
export const CLINIC_EMAIL_MAX_CHARS = 200;
export const CLINIC_WEBSITE_MAX_CHARS = 300;
export const PRICE_NOTE_MAX_CHARS = 200;
export const TIME_BLOCK_NOTE_MAX_CHARS = 200;
export const SERVICE_DURATION_MIN_MINUTES = 5;
export const SERVICE_DURATION_MAX_MINUTES = 480;

// Tandlæger og portefølje (architecture 4.3 `clinic_dentists`, `portfolio_items`).
export const DENTIST_NAME_MAX_CHARS = 100;
export const DENTIST_TITLE_MAX_CHARS = 100;
export const DENTIST_BIO_MAX_CHARS = 1000;
export const PORTFOLIO_CAPTION_MAX_CHARS = 200;

// Rimelige lofter i API'et (ikke i databasen).
export const MAX_DENTISTS_PER_CLINIC = 30;
export const MAX_PORTFOLIO_ITEMS_PER_CLINIC = 60;
export const MAX_PRICE_DKK = 1_000_000;
export const MAX_PRICE_ROWS = 100;
export const MAX_OPENING_HOUR_WINDOWS = 42; // højst seks vinduer pr. ugedag

// ISO-ugedage (1 = mandag … 7 = søndag, architecture 4.3 `clinic_opening_hours`).
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABEL = {
  1: "Mandag",
  2: "Tirsdag",
  3: "Onsdag",
  4: "Torsdag",
  5: "Fredag",
  6: "Lørdag",
  7: "Søndag",
} as const satisfies Record<(typeof WEEKDAYS)[number], string>;
