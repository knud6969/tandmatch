// Beskedtråd (architecture 4.3 `messages`, 10.12). Længde og døgnloft står i lib/common/constants/limits.ts.
// (SQL) enum message_sender_role.
export const MESSAGE_SENDER_ROLES = ["patient", "clinic"] as const;

// Vises over beskeder fra klinikken i patientens tråd (også når klinikkontoen er slettet).
export const CLINIC_SENDER_LABEL = "Klinikken";

// Beskedtråden (architecture 10.12): afsendernavne, tekster og pollingtid.
export const MESSAGE_POLL_INTERVAL_MS = 15_000;
export const PATIENT_SENDER_LABEL = "Patienten";
export const OWN_SENDER_LABEL = "Dig";

// Billeder i beskeder (10.12). Vises i stedet for en besked, hvis billeder er slettet (fx tilbagetrukket billedsamtykke),
// og den ikke havde tekst.
export const MESSAGE_IMAGES_DELETED_TEXT = "Billedet er slettet.";
// En signeret billed-URL lever 5 minutter. Klienterne genbruger den samme URL i op til 4 minutter på tværs af polling,
// så billedet ikke hentes igen hvert 15. sekund.
export const MESSAGE_IMAGE_URL_REUSE_MS = 4 * 60_000;
