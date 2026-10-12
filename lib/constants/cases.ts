// Sagens status og ønskede tidsramme (architecture 4.3, enums case_status og case_timeframe).
// Typerne CaseStatus og CaseTimeframe udledes herfra i lib/types/cases.ts.
export const CASE_STATUSES = ["draft", "submitted", "closed"] as const;
export const CASE_TIMEFRAMES = ["asap", "within_2_weeks", "within_3_months", "flexible"] as const;
