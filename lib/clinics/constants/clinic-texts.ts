// Faste tekster i klinikoversigten og profilen. Delt af klinik-weben og patient-appen (architecture 2.1).

// Kilden, der står ved alle priser patienten ser (priser vises altid med kilde).
export const PRICE_SOURCE = "ifølge klinikkens prisliste";
export const PRICE_FINAL_NOTE = "Klinikken laver den endelige vurdering; prisen kan afvige.";

// Niveaumærkater (architecture 6.6): verificeret klinik (fuldt niveau) eller basisklinik.
export const VERIFIED_CLINIC_LABEL = "Verificeret klinik";
export const BASIC_CLINIC_LABEL = "Ikke på TandMatch endnu";
export const BASIC_CLINIC_FACTS_TEXT = "Ikke på TandMatch endnu. Kun grunddata: ingen priser eller anmeldelser.";
export const BASIC_CLINIC_PROFILE_TITLE = "Klinikken er endnu ikke på TandMatch";
export const BASIC_CLINIC_PROFILE_TEXT =
  "Grunddata er offentligt tilgængelige. Ingen prisliste, anmeldelser eller ledige tider, og klinikken kan ikke kontaktes via TandMatch. Ring eller skriv direkte.";

export const NO_REVIEWS_TEXT = "Ingen verificerede anmeldelser endnu";

// Mærket på klinikkens forhåndsvisning af sin profil (/klinik/profil/forhaandsvisning, features/clinics 6.5).
export const PROFILE_PREVIEW_LABEL = "Forhåndsvisning – sådan ser patienter din profil i appen";
