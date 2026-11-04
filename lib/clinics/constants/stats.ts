// Klinikkens statistik (clinics 6.3 og 10.18). Perioderne i dage; 365 vises som "12 måneder".
export const CLINIC_STATS_PERIODS = [30, 90, 365] as const;
export const DEFAULT_CLINIC_STATS_PERIOD = 30;

export const CLINIC_STATS_PERIOD_LABEL = {
  30: "30 dage",
  90: "90 dage",
  365: "12 måneder",
} as const satisfies Record<(typeof CLINIC_STATS_PERIODS)[number], string>;

// Et besvaret lead er besvaret rettidigt inden for så mange timer (SQL: clinic_stats(), answered_within_24h).
export const STATS_RESPONSE_WINDOW_HOURS = 24;

// Tekster på /klinik/statistik.
export const STATS_PAGE_TITLE = "Statistik";
export const STATS_PERIOD_LABEL = "Periode";
export const STATS_EXPLANATION = "Henvendelser tælles efter modtagelsesdato, bookinger efter tidspunktet for tiden. Kun jeres egne tal.";
export const STATS_NOT_VERIFIED_TEXT = "Din statistik er ikke tilgængelig endnu.";
export const STATS_NO_VALUE = "–";

export const STATS_LABEL = {
  leads: "Henvendelser",
  accepted: "Accepteret",
  declined: "Afvist",
  response: "Svartid",
  bookings: "Bookinger",
  cancelled: "Aflyst",
  conversion: "Fra henvendelse til booking",
} as const;

export const STATS_UNDER_LEAD = {
  pending: (count: number) => `${count} venter på svar`,
  acceptRate: (pct: number) => `${pct} % af besvarede`,
  within24h: (pct: number) => `${pct} % besvaret inden for ${STATS_RESPONSE_WINDOW_HOURS} timer`,
  upcomingNoShow: (upcoming: number, noShow: number) => `${upcoming} kommende · ${noShow} udeblevet`,
  cancelled: (byPatient: number, byClinic: number) => `${byPatient} af patienter · ${byClinic} af jer`,
} as const;
