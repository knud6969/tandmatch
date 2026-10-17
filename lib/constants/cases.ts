// Sagens status og ønskede tidsramme (architecture 4.3, enums case_status og case_timeframe).
// Typerne CaseStatus og CaseTimeframe udledes herfra i lib/types/cases.ts.
export const CASE_STATUSES = ["draft", "submitted", "closed"] as const;
export const CASE_TIMEFRAMES = ["asap", "within_2_weeks", "within_3_months", "flexible"] as const;

// Danske navne for det ønskede tidsrum.
export const CASE_TIMEFRAME_LABEL = {
  asap: "Så hurtigt som muligt",
  within_2_weeks: "Inden for 2 uger",
  within_3_months: "Inden for 3 måneder",
  flexible: "Jeg er fleksibel",
} as const satisfies Record<(typeof CASE_TIMEFRAMES)[number], string>;

// Leadstatus, som patienten ser den på sagen (enum lead_status i databasen). Trin 4 (lib/constants/leads.ts) overtager den fulde liste.
export const CASE_LEAD_STATUSES = ["sent", "accepted", "declined", "booked", "withdrawn"] as const;
// Leads, der tæller med i de højst 3 aktive pr. sag (architecture 10.5). Samme regel som i send_leads().
export const CASE_ACTIVE_LEAD_STATUSES = ["sent", "accepted", "booked"] as const;
