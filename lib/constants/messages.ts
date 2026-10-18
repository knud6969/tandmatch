// Beskedtråd (architecture 4.3 `messages`, 10.12). Længde og døgnloft står i lib/constants/limits.ts.
// (SQL) enum message_sender_role.
export const MESSAGE_SENDER_ROLES = ["patient", "clinic"] as const;

// Vises over beskeder fra klinikken i patientens tråd (også når klinikkontoen er slettet).
export const CLINIC_SENDER_LABEL = "Klinikken";
