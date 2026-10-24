// Leads (architecture 4.2 enums lead_status og lead_decline_reason, 4.3 `leads`). Typerne udledes herfra i lib/leads/types/leads.ts.
export const LEAD_STATUSES = ["sent", "accepted", "declined", "booked", "withdrawn"] as const;
// Leads, der tæller med i de højst 3 aktive pr. sag. Samme regel som is_lead_active_status() i databasen.
export const LEAD_ACTIVE_STATUSES = ["sent", "accepted", "booked"] as const;
export const LEAD_DECLINE_REASONS = ["no_capacity", "not_offered", "needs_referral", "other", "clinic_left"] as const;
// Årsager, klinikken selv må vælge. `clinic_left` sættes kun af systemet, når klinikkontoen slettes (clinic_decide_lead()).
export const LEAD_CLINIC_DECLINE_REASONS = ["no_capacity", "not_offered", "needs_referral", "other"] as const;
// (SQL) leads.clinic_comment og leads.decline_note.
export const LEAD_COMMENT_MAX_CHARS = 500;
export const LEAD_DECLINE_NOTE_MAX_CHARS = 200;

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

// Klinikkens indbakke (architecture 6.3): statusnavne set fra klinikken og filtrene, nye først.
export const CLINIC_LEAD_STATUS_LABEL = {
  sent: "Venter på dit svar",
  accepted: "Accepteret",
  declined: "Afvist",
  booked: "Tid booket",
  withdrawn: "Trukket tilbage",
} as const satisfies Record<(typeof LEAD_STATUSES)[number], string>;

// Akutvejen (architecture 10.11): længden på patientens beskrivelse. Samme grænser i send_emergency_lead().
export const EMERGENCY_DESCRIPTION_MIN = 10;
export const EMERGENCY_DESCRIPTION_MAX = 1000;

export const WITHDRAWN_LEAD_TEXT = "Patienten har trukket henvendelsen tilbage";

// Konsekvensen af at trække en henvendelse tilbage, som patienten ser før bekræftelsen.
export const WITHDRAW_LEAD_CONSEQUENCE = "Klinikken ser kun, at henvendelsen er trukket tilbage, ikke din beskrivelse. Du kan vælge en anden klinik i stedet.";
