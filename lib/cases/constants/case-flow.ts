// Sagsflowet som én samtale i appen (architecture 7.9). Trinnene afgøres af nextCaseFlowStep() i lib/cases/domain/case-flow.ts.
// Typen CaseFlowStep udledes herfra i lib/cases/types/cases.ts. Kortene er fra "TandMatch", ikke fra AI'en.
export const CASE_FLOW_STEPS = ["submitted", "emergency", "chat", "services", "timeframe", "postal_code", "summary", "ready"] as const;

export const CASE_FLOW_TEXTS = {
  servicesQuestion: "Passer disse behandlinger?",
  servicesNotSure: "Jeg er ikke sikker",
  servicesPickMyself: "Vælg selv",
  servicesConfirm: "Bekræft",
  timeframeQuestion: "Hvornår vil du gerne i gang?",
  postalCodeQuestion: "Hvor vil du helst gå til tandlæge?",
  summaryApprove: "Det passer",
  summaryEdit: "Ret",
  summarySaveAndApprove: "Gem og godkend",
  summaryRegenerate: "Nyt udkast",
  summaryWriteYourself: "Skriv kort, hvad klinikken skal vide",
  imagesChanged: "Billederne er ændret. Godkend igen.",
  readyTitle: "Din beskrivelse er klar",
  readyCannotSend: "Du kan ikke sende flere henvendelser på denne sag lige nu.",
  readySeeClinics: "Se klinikker der kan hjælpe",
  answeredEdit: "Ret",
} as const;

// Efter så mange patientbeskeder vises behandlingskortet, også uden forslag (architecture 7.9a regel 1).
export const SERVICE_CARD_AFTER_USER_MESSAGES = 6;
