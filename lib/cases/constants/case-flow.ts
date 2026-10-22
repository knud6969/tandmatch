// Sagsflowet som én samtale i appen (architecture 7.9). Trinnene afgøres af nextCaseFlowStep() i lib/cases/domain/case-flow.ts.
// Typen CaseFlowStep udledes herfra i lib/cases/types/cases.ts. Kortene er fra "TandMatch", ikke fra AI'en.
export const CASE_FLOW_STEPS = ["submitted", "emergency", "chat", "services", "timeframe", "postal_code", "summary", "ready"] as const;

export const CASE_FLOW_TEXTS = {
  servicesQuestion: "Passer disse behandlinger?",
  servicesNotSure: "Jeg er ikke sikker",
  servicesPickMyself: "Vælg selv",
  servicesConfirm: "Bekræft",
  timeframeQuestion: "Hvornår vil du gerne i gang?",
  postalCodeQuestion: "Hvor vil du helst gå til tandlæge? Skriv postnummeret.",
  summaryClinicSees: "Det er denne tekst, klinikken ser",
  summaryApprove: "Det passer",
  summaryEdit: "Ret",
  summarySaveAndApprove: "Gem og godkend",
  summaryRegenerate: "Lav ny opsummering",
  summaryWriteYourself: "Skriv selv kort, hvad klinikken skal vide",
  imagesChanged: "Du har ændret billederne. Godkend beskrivelsen igen",
  readyTitle: "Din beskrivelse er klar.",
  readyCannotSend: "Du kan ikke sende flere henvendelser på denne sag lige nu. Du kan følge sagen under Mine sager.",
  readySeeClinics: "Se klinikker der kan hjælpe",
  answeredEdit: "Ret",
} as const;
