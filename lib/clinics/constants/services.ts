// Ydelseskataloget (architecture 4.3 `services`). Værdierne skal svare til enum service_category i databasen.
export const SERVICE_CATEGORIES = ["cosmetic", "general", "emergency"] as const;

// Danske visningsnavne til kategorierne.
export const SERVICE_CATEGORY_LABEL = {
  cosmetic: "Kosmetisk",
  general: "Almindelig",
  emergency: "Akut",
} as const satisfies Record<(typeof SERVICE_CATEGORIES)[number], string>;

// Slugs, som koden afhænger af (kataloget oprettes i migrationen 20261012000200_services_catalog.sql).
// Bruges, når patienten er usikker på, hvilken ydelse der er tale om (architecture 7.3).
export const EXAMINATION_SERVICE_SLUG = "undersoegelse";
// Forvalgt akutydelse på /akut (architecture 6.1).
export const EMERGENCY_DEFAULT_SERVICE_SLUG = "akut_konsultation";
