import type { ConsentType } from "@/lib/types/common";

// Korte danske navne til samtykketyperne (architecture 4.3). Selve teksten, brugeren har godkendt, står i CONSENT_TEXTS.
export const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  ai_processing: "AI-behandling af tekst og billeder",
  image_upload: "Billedupload",
  health_data_sharing: "Deling af din beskrivelse med tandlæger",
};

// Konsekvens af at trække samtykket tilbage, vist i bekræftelsen (architecture 5.3, 7.7).
export const CONSENT_WITHDRAW_CONSEQUENCE: Record<ConsentType, string> = {
  ai_processing:
    "Er du anonym, slettes hele din session, inklusive din kladde-forespørgsel og dine billeder, med det samme. " +
    "Har du en konto, bliver din aktive AI-samtale i stedet lukket, og du kan stadig skrive din beskrivelse selv.",
  image_upload:
    "Dine uploadede billeder bliver slettet, også i forespørgsler du allerede har sendt. De tandlæger, der har fået " +
    "forespørgslen, mister dermed adgangen til billederne.",
  health_data_sharing:
    "Det påvirker ikke forespørgsler, du allerede har sendt, men din beskrivelse kan ikke deles med nye tandlæger, før du giver samtykke igen.",
};
