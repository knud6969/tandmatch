import type { ConsentType } from "@/lib/common/types/common";

// Samtykketekster (architecture 4.3). Vilkårs-accept er IKKE et samtykke.
// Hver version er en streng af formen "<type>@<version>", som gemmes i consents.text_version.
// Teksterne er pladsholdere i prototypen [PROTOTYPE] og skal juridisk gennemgås (12.4).
export const CONSENT_TYPES = ["ai_processing", "image_upload", "health_data_sharing"] as const;

export const CONSENT_TEXT_VERSIONS = {
  ai_processing: "ai_processing@v0-prototype",
  // v1: oplyser eksplicit om AI-tjenesten (OpenAI) og at det er en beskrivelse, ikke en vurdering.
  // Tidligere samtykker (v0) forbliver gyldige rækker, men nye uploads kræver denne version.
  image_upload: "image_upload@v1-ai-disclosure",
  // v1: deling med de klinikker, patienten selv vælger; navn og kontakt deles først ved booking.
  health_data_sharing: "health_data_sharing@v1-klinikker",
} as const;

export const CONSENT_TEXTS = {
  ai_processing:
    "Jeg accepterer, at tekst og chat om mit tandproblem sendes til en AI-tjeneste og behandles, så min beskrivelse kan struktureres. Hvis jeg ikke opretter en konto, slettes data efter 48 timer.",
  image_upload:
    "Jeg accepterer at uploade fotos af min mund. Billederne sendes til en AI-tjeneste (OpenAI), som beskriver " +
    "synligt indhold på billedet (fx vinkel og hvad der er synligt) - beskrivelsen er IKKE en vurdering eller diagnose, " +
    "det er altid tandlægens opgave. Fotos er helbredsoplysninger og slettes efter 48 timer, hvis jeg ikke opretter en konto.",
  health_data_sharing:
    "Jeg accepterer, at min godkendte beskrivelse, mine valgte behandlinger, mit ønskede tidsrum, mit postnummer og eventuelle billeder deles med de klinikker, jeg selv vælger at kontakte via TandMatch. Når jeg booker en tid, får klinikken også mit navn, mit telefonnummer og min e-mail.",
} as const;

// Korte danske navne til samtykketyperne (architecture 4.3). Selve teksten, brugeren har godkendt, står i CONSENT_TEXTS.
export const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  ai_processing: "AI-behandling af tekst og billeder",
  image_upload: "Billedupload",
  health_data_sharing: "Deling af din sag med de klinikker, du vælger",
};

// Klinikkens bekræftelse ved upload af porteføljebillede (architecture 9.5). Gemmes på portfolio_items
// (patient_consent_confirmed_at og consent_text_version), ikke i consents, fordi det ikke er patientens samtykke
// i platformen, men klinikkens erklæring som dataansvarlig. Juridisk gennemgang mangler [ÅBEN, 12.3].
export const PORTFOLIO_CONSENT_TEXT_VERSION = "portfolio_consent@v0-prototype";

export const PORTFOLIO_CONSENT_TEXT =
  "Jeg bekræfter, at patienten på billedet har givet skriftligt samtykke til, at billedet vises offentligt på " +
  "klinikkens profil på TandMatch, og at billedet ikke viser ansigt eller andet, der kan identificere patienten.";
