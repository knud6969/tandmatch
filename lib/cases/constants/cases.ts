// Sagens status og ønskede tidsramme (architecture 4.3, enums case_status og case_timeframe).
// Typerne CaseStatus og CaseTimeframe udledes herfra i lib/cases/types/cases.ts.
export const CASE_STATUSES = ["draft", "submitted", "closed"] as const;
// Danske navne for sagens status.
export const CASE_STATUS_LABEL = {
  draft: "Ikke sendt endnu",
  submitted: "Sendt til klinikker",
  closed: "Lukket",
} as const satisfies Record<(typeof CASE_STATUSES)[number], string>;
export const CASE_TIMEFRAMES = ["asap", "within_2_weeks", "within_3_months", "flexible"] as const;

// Danske navne for det ønskede tidsrum.
export const CASE_TIMEFRAME_LABEL = {
  asap: "Så hurtigt som muligt",
  within_2_weeks: "Inden for 2 uger",
  within_3_months: "Inden for 3 måneder",
  flexible: "Jeg er fleksibel",
} as const satisfies Record<(typeof CASE_TIMEFRAMES)[number], string>;

// Konsekvensen af at lukke en sag, som patienten ser før bekræftelsen (architecture 6.2).
export const CLOSE_CASE_CONSEQUENCE =
  "Henvendelser, som klinikken ikke har svaret på, og accepterede henvendelser uden booket tid trækkes tilbage, og en reserveret akuttid frigives. Bookede tider består; du kan aflyse dem under Bookinger.";
