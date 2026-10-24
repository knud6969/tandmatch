// Faste tekster i klinikoversigten og profilen. KOPIER af tekster, der i dag står i views/ (PRICE_SOURCE i
// price-with-source.tsx, tier-badge.tsx, clinic-facts.tsx, trustpilot-block.tsx, public-review-list.tsx).
// De skal flyttes til lib/<domæne>/constants/ og importeres af både weben og appen (rapporteret i 8.4).
import type { TrustpilotInfo } from "@/lib/common/types/common";

export const PRICE_SOURCE = "ifølge klinikkens prisliste";
export const VERIFIED_CLINIC_LABEL = "Verificeret klinik";
export const BASIC_CLINIC_LABEL = "Ikke på TandMatch endnu";
export const BASIC_CLINIC_FACTS_TEXT =
  "Ikke på TandMatch endnu. Kun grunddata: ingen priser eller anmeldelser.";
export const BASIC_CLINIC_PROFILE_TITLE = "Klinikken er endnu ikke på TandMatch";
export const BASIC_CLINIC_PROFILE_TEXT =
  "Grunddata er offentligt tilgængelige. Ingen prisliste, anmeldelser eller ledige tider, og klinikken kan ikke kontaktes via TandMatch. Ring eller skriv direkte.";
export const NO_REVIEWS_TEXT = "Ingen verificerede anmeldelser endnu";
export const PRICE_FINAL_NOTE = "Klinikken laver den endelige vurdering; prisen kan afvige.";

// Trustpilot vises altid med kilde: hvem der har angivet scoren og linket.
export function trustpilotSource(trustpilot: NonNullable<TrustpilotInfo>): string {
  return trustpilot.enteredBy === "clinic" ? "angivet af klinikken" : "angivet af TandMatch";
}
