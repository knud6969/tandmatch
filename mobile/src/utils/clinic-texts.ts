// Faste tekster i klinikoversigten og profilen. KOPIER af tekster, der i dag står i views/ (PRICE_SOURCE i
// price-with-source.tsx, tier-badge.tsx, clinic-facts.tsx, trustpilot-block.tsx, public-review-list.tsx).
// De skal flyttes til lib/constants/ og importeres af både weben og appen (rapporteret i 8.4).
import type { TrustpilotInfo } from "@/lib/types/common";

export const PRICE_SOURCE = "ifølge klinikkens prisliste";
export const VERIFIED_CLINIC_LABEL = "Verificeret klinik";
export const BASIC_CLINIC_LABEL = "Ikke på TandMatch endnu";
export const BASIC_CLINIC_FACTS_TEXT =
  "Klinikken er endnu ikke på TandMatch. Vi viser kun grunddata, så der er ingen priser eller anmeldelser her.";
export const BASIC_CLINIC_PROFILE_TITLE = "Klinikken er endnu ikke på TandMatch";
export const BASIC_CLINIC_PROFILE_TEXT =
  "Vi viser kun de grunddata, der er offentligt tilgængelige. Klinikken har endnu ikke oprettet sig hos os, så der er ingen prisliste, ingen verificerede anmeldelser og ingen ledige tider, og du kan ikke kontakte klinikken via TandMatch. Ring eller skriv til klinikken direkte.";
export const NO_REVIEWS_TEXT = "Ingen verificerede anmeldelser endnu";
export const PRICE_FINAL_NOTE = "Klinikken laver den endelige vurdering, og den endelige pris kan afvige.";

// Trustpilot vises altid med kilde: hvem der har angivet scoren og linket.
export function trustpilotSource(trustpilot: NonNullable<TrustpilotInfo>): string {
  return trustpilot.enteredBy === "clinic" ? "angivet af klinikken" : "angivet af TandMatch";
}
