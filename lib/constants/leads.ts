// Leads (architecture 4.2 enums lead_status og lead_decline_reason, 4.3 `leads`). Typerne udledes herfra i lib/types/leads.ts.
export const LEAD_STATUSES = ["sent", "accepted", "declined", "booked", "withdrawn"] as const;
// Leads, der tæller med i de højst 3 aktive pr. sag. Samme regel som is_lead_active_status() i databasen.
export const LEAD_ACTIVE_STATUSES = ["sent", "accepted", "booked"] as const;
export const LEAD_DECLINE_REASONS = ["no_capacity", "not_offered", "needs_referral", "other", "clinic_left"] as const;
