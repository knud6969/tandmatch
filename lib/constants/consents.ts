// Samtykketekster (architecture 4.3). Vilkårs-accept er IKKE et samtykke.
// Hver version er en streng af formen "<type>@<version>", som gemmes i consents.text_version.
// Teksterne er pladsholdere i prototypen [PROTOTYPE] og skal juridisk gennemgås (12.4).
export const CONSENT_TYPES = ["ai_processing", "image_upload", "health_data_sharing"] as const;

export const CONSENT_TEXT_VERSIONS = {
  ai_processing: "ai_processing@v0-prototype",
  image_upload: "image_upload@v0-prototype",
  health_data_sharing: "health_data_sharing@v0-prototype",
} as const;

export const CONSENT_TEXTS = {
  ai_processing:
    "Jeg accepterer, at tekst og chat om mit tandproblem sendes til en AI-tjeneste og behandles, så min beskrivelse kan struktureres. Hvis jeg ikke opretter en konto, slettes data efter 48 timer.",
  image_upload:
    "Jeg accepterer at uploade fotos af min mund. Fotos er helbredsoplysninger og slettes efter 48 timer, hvis jeg ikke opretter en konto.",
  health_data_sharing:
    "Jeg accepterer, at min godkendte beskrivelse og eventuelle billeder deles med de tandlæger, min forespørgsel sendes til.",
} as const;
