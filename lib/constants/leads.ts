// Leads (architecture 4.2 enums lead_status og lead_decline_reason, 4.3 `leads`). Typerne udledes herfra i lib/types/leads.ts.
export const LEAD_STATUSES = ["sent", "accepted", "declined", "booked", "withdrawn"] as const;
// Leads, der tæller med i de højst 3 aktive pr. sag. Samme regel som is_lead_active_status() i databasen.
export const LEAD_ACTIVE_STATUSES = ["sent", "accepted", "booked"] as const;
export const LEAD_DECLINE_REASONS = ["no_capacity", "not_offered", "needs_referral", "other", "clinic_left"] as const;

// Danske navne til patientens visning af et lead (architecture 10.9).
export const LEAD_STATUS_LABEL = {
  sent: "Afventer svar",
  accepted: "Accepteret",
  declined: "Afvist",
  booked: "Tid booket",
  withdrawn: "Trukket tilbage",
} as const satisfies Record<(typeof LEAD_STATUSES)[number], string>;

export const LEAD_DECLINE_REASON_LABEL = {
  no_capacity: "Klinikken har ikke kapacitet lige nu",
  not_offered: "Klinikken tilbyder ikke behandlingen",
  needs_referral: "Behandlingen kræver henvisning",
  other: "Anden begrundelse",
  clinic_left: "Klinikken er ikke længere på TandMatch",
} as const satisfies Record<(typeof LEAD_DECLINE_REASONS)[number], string>;

// Vises i stedet for navnet, når klinikken ikke længere er på TandMatch. Ens i sagslisten og på sagen.
export const REMOVED_CLINIC_LABEL = "Klinikken er ikke længere på TandMatch";
// Teksten under prisen på leadkortet, når klinikken har præciseret prisen efter at have set sagen.
export const QUOTED_PRICE_LABEL = "Klinikkens pris efter at have set din sag";
