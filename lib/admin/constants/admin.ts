import { MODERATION_REJECTION_REASONS } from "@/lib/booking/constants/reviews";

// Admins sider (features/admin 6.4). Delte labels genbruges fra lib: CLINIC_STATUS_LABEL (clinics) og MODERATION_LABEL (booking).
export const ADMIN_LIST_LIMIT = 200;
export const ADMIN_REASON_MAX_CHARS = 500; // (SQL) admin_clean_reason()
export const ADMIN_EXCERPT_CHARS = 200;

export const MODERATION_KINDS = ["review", "reply"] as const;

export const ADMIN_MODERATION_TITLE = "Moderation";
export const ADMIN_CLINICS_TITLE = "Klinikker";
export const MODERATION_KIND_LABEL = { review: "Anmeldelser", reply: "Klinikkers svar" } as const satisfies Record<(typeof MODERATION_KINDS)[number], string>;
// Filteret på moderationsstatus bruger andre ord end MODERATION_LABEL ("Afventer" i stedet for "Afventer godkendelse").
export const MODERATION_FILTER_LABEL = { pending: "Afventer", approved: "Godkendt", rejected: "Afvist" } as const;
export const MODERATION_EMPTY_TEXT = "Der er intet at moderere.";
export const MODERATION_RECEIPT = { approved: "Godkendt", rejected: "Afvist" } as const;
export const MODERATION_APPROVE_LABEL = "Godkend";
export const MODERATION_REJECT_LABEL = "Afvis";
export const MODERATION_REASON_LABEL = "Begrundelse (vises for patienten eller klinikken)";
export { MODERATION_REJECTION_REASONS };

export const CLINIC_SEARCH_LABEL = "Søg på navn, by eller CVR";
export const CLINIC_STATUS_FILTER_ALL = "Alle";
export const CLINIC_EMPTY_TEXT = "Ingen klinikker passer til søgningen.";
export const CLINIC_VERIFY_LABEL = "Verificér";
export const CLINIC_PAUSE_LABEL = "Sæt på pause";
export const CLINIC_PAUSE_CONSEQUENCE =
  "Klinikken forsvinder fra oversigten og kan hverken modtage eller se henvendelser og bookinger, før den bliver verificeret igen. Patienternes henvendelser bliver liggende.";
export const CLINIC_VERIFY_CONSEQUENCE = "Klinikken vises i oversigten og kan modtage henvendelser og bookinger.";
export const CLINIC_ACTION_REASON_LABEL = "Begrundelse (valgfri)";
export const CLINIC_ACTION_CONFIRM_LABEL = "Bekræft";
export const CLINIC_ACTION_CANCEL_LABEL = "Fortryd";
export const CLINIC_HAS_ACCOUNT = { yes: "Ja", no: "Nej" } as const;
