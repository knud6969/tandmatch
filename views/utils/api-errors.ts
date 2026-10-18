import { MAX_DENTISTS_PER_CLINIC, MAX_PORTFOLIO_ITEMS_PER_CLINIC, MAX_TIME_BLOCKS_PER_CLINIC } from "@/lib/constants/clinics";
import {
  ALREADY_REPLIED_TEXT,
  ALREADY_REVIEWED_TEXT,
  BOOKING_LIMIT_TEXT,
  BOOKING_NOT_CANCELLABLE_TEXT,
  CLINIC_NOT_VERIFIED_TEXT,
  LEAD_NOT_ACCEPTED_TEXT,
  MESSAGE_LIMIT_TEXT,
  NO_SHOW_WINDOW_CLOSED_TEXT,
  REVIEW_NOT_ALLOWED_TEXT,
  SLOT_TAKEN_TEXT,
  SLOT_UNAVAILABLE_TEXT,
  THREAD_CLOSED_TEXT,
} from "@/lib/constants/error-texts";
import {
  CHAT_MAX_USER_MESSAGES_PER_CONVERSATION,
  MAX_ACTIVE_LEADS_PER_CASE,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGES_PER_CASE,
  MAX_LEADS_PER_PATIENT_DAY,
  MAX_TOTAL_LEADS_PER_CASE,
} from "@/lib/constants/limits";
import { ApiRequestError } from "@/views/utils/api-client";
import { ImagePrepareError } from "@/views/utils/prepare-image";

// Danske fejlbeskeder ud fra API-fejlkoder (architecture 2.4). Ukendte koder viser serverens danske besked.
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail eller adgangskode er forkert. Tjek oplysningerne og prøv igen.",
  EMAIL_EXISTS: "Der findes allerede en konto med denne e-mail. Prøv at logge ind i stedet.",
  EMAIL_CONFIRMATION_REQUIRED:
    "Kontoen kan ikke oprettes endnu, fordi der kræves e-mailbekræftelse. Det understøttes ikke i prototypen endnu.",
  ALREADY_AUTHENTICATED: "Du er allerede logget ind.",
  ANONYMOUS_SESSION_ACTIVE: "Din samtale skal gemmes på en konto. Brug formularen til at oprette konto.",
  TERMS_REQUIRED: "Du skal acceptere brugervilkårene og privatlivspolitikken først.",
  OUTDATED_TERMS: "Vilkårene er opdateret. Læs de nye vilkår og accepter igen.",
  AUTH_UNAVAILABLE: "Login-tjenesten svarer ikke lige nu. Prøv igen om lidt.",
  UNAUTHENTICATED: "Din session er udløbet. Log ind igen.",
  PROFILE_MISSING: "Kontoen er ikke klar endnu. Prøv igen om lidt.",
  NETWORK: "Vi kunne ikke oprette forbindelse. Tjek din internetforbindelse og prøv igen.",
  NOT_FOUND: "Vi kunne ikke finde det, du søgte efter.",
  CONSENT_REQUIRED: "Du skal give samtykke til at dele din beskrivelse med klinikkerne, før du kan sende.",
  CONSENT_VERSION_MISMATCH: "Samtykketeksten er opdateret. Læs den igen og giv samtykke.",
  CONVERSATION_CLOSED: "Samtalen er lukket. Du kan stadig lave en opsummering.",
  CHAT_LIMIT: `Samtalen har nået grænsen på ${CHAT_MAX_USER_MESSAGES_PER_CONVERSATION} beskeder. Du kan lave en opsummering af det, du har skrevet.`,
  RATE_LIMITED: "Der er sendt for mange forsøg på kort tid. Vent lidt, og prøv igen.",
  AI_TIMEOUT: "AI-assistenten svarede ikke i tide. Prøv igen om lidt.",
  AI_UNAVAILABLE: "AI-assistenten er ikke tilgængelig lige nu. Prøv igen om lidt.",
  SUMMARY_LIMIT: "Du har brugt de mulige udkast til denne sag. Ret teksten selv i stedet.",
  INVALID_FORM: "Billedet kunne ikke sendes. Prøv et andet billede.",
  MISSING_FILE: "Vælg et billede, før du uploader.",
  FILE_TOO_LARGE: `Billedet er for stort. Vælg et billede på højst ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} MB.`,
  IMAGE_LIMIT: `Du kan højst uploade ${MAX_IMAGES_PER_CASE} billeder pr. sag.`,
  ACCOUNT_REQUIRED: "Opret en konto for at fortsætte.",
  SUMMARY_NOT_APPROVED: "Godkend opsummeringen, før sagen sendes.",
  POSTAL_CODE_REQUIRED: "Angiv dit postnummer, før sagen sendes.",
  POSTAL_CODE_UNKNOWN: "Postnummeret findes ikke i postnummerlisten. Tjek det og prøv igen.",
  LEAD_LIMIT: `Din sag kan højst have ${MAX_ACTIVE_LEADS_PER_CASE} aktive henvendelser ad gangen. Træk en henvendelse tilbage, eller vælg færre klinikker.`,
  LEAD_DAILY_LIMIT: `Du har sendt henvendelser til mange klinikker i dag. Der kan højst sendes ${MAX_LEADS_PER_PATIENT_DAY} henvendelser pr. døgn. Prøv igen senere.`,
  LEAD_TOTAL_LIMIT: `Din sag er allerede sendt til ${MAX_TOTAL_LEADS_PER_CASE} klinikker, som er det højeste antal pr. sag. Start en ny samtale, hvis du har brug for flere.`,
  CLINIC_ALREADY_CONTACTED: "Du har allerede kontaktet en af klinikkerne med denne sag. Vælg en anden klinik.",
  CLINIC_NOT_AVAILABLE: "Klinikken kan ikke kontaktes via TandMatch lige nu. Prøv igen senere, eller vælg en anden klinik.",
  CASE_NOT_READY: "Din sag er ikke klar til at blive sendt. Godkend opsummeringen, og angiv behandlinger, tidsrum og postnummer.",
  LEAD_NOT_PENDING: "Henvendelsen er allerede besvaret eller trukket tilbage, så den kan ikke ændres. Genindlæs siden for at se den nyeste status.",
  CLINIC_NOT_VERIFIED: CLINIC_NOT_VERIFIED_TEXT,
  THREAD_CLOSED: THREAD_CLOSED_TEXT,
  MESSAGE_LIMIT: MESSAGE_LIMIT_TEXT,
  ALREADY_WITHDRAWN: "Samtykket er allerede trukket tilbage.",
  EXPORT_FAILED: "Dine data kunne ikke hentes lige nu. Prøv igen om lidt.",
  CLINIC_EXISTS: "Der findes allerede en klinik med dette CVR-nummer, som er knyttet til en konto. Kontakt os, hvis det er din klinik.",
  TRUSTPILOT_URL_REQUIRED: "Angiv linket til din Trustpilot-side, hvis du angiver score eller antal anmeldelser.",
  UNKNOWN_SERVICE: "En af behandlingerne findes ikke længere i kataloget. Genindlæs siden og prøv igen.",
  DENTIST_LIMIT: `Du kan højst oprette ${MAX_DENTISTS_PER_CLINIC} tandlæger.`,
  PORTFOLIO_LIMIT: `Du kan højst have ${MAX_PORTFOLIO_ITEMS_PER_CLINIC} porteføljebilleder.`,
  TIME_BLOCK_LIMIT: `Du kan højst have ${MAX_TIME_BLOCKS_PER_CLINIC} blokerede tider. Slet nogle gamle, før du tilføjer flere.`,
  SERVICE_GROUP_NOT_SELECTED: "Vælg først kategorien, før du angiver priser i den.",
  UNKNOWN_SERVICE_GROUP: "En af kategorierne findes ikke længere i kataloget. Genindlæs siden og prøv igen.",
  INVALID_IMAGE: "Billedet kunne ikke bruges. Vælg et JPEG- eller PNG-billede.",
  FORBIDDEN: "Du har ikke adgang til denne handling.",
  ANONYMOUS_NOT_ALLOWED: "Opret en konto for at fortsætte.",
  SIGNUP_FAILED: "Kontoen kunne ikke oprettes. Tjek oplysningerne og prøv igen.",
  PAYLOAD_TOO_LARGE: "Indholdet er for stort. Gør det mindre og prøv igen.",
  INVALID_JSON: "Oplysningerne kunne ikke læses. Genindlæs siden og prøv igen.",
  INTERNAL: "Der opstod en fejl hos os. Prøv igen om lidt.",
  SLOT_TAKEN: SLOT_TAKEN_TEXT,
  SLOT_UNAVAILABLE: SLOT_UNAVAILABLE_TEXT,
  LEAD_NOT_ACCEPTED: LEAD_NOT_ACCEPTED_TEXT,
  BOOKING_NOT_CANCELLABLE: BOOKING_NOT_CANCELLABLE_TEXT,
  NO_SHOW_WINDOW_CLOSED: NO_SHOW_WINDOW_CLOSED_TEXT,
  REVIEW_NOT_ALLOWED: REVIEW_NOT_ALLOWED_TEXT,
  BOOKING_LIMIT: BOOKING_LIMIT_TEXT,
  ALREADY_REVIEWED: ALREADY_REVIEWED_TEXT,
  ALREADY_REPLIED: ALREADY_REPLIED_TEXT,
  INVALID_REVIEW: "Anmeldelsen kunne ikke gemmes. Tjek felterne og prøv igen.",
};

// Neutrale tekster, når serverens besked ikke kan vises som den står.
const NEUTRAL_BY_CODE: Record<string, string> = {
  VALIDATION_ERROR: "Oplysningerne kunne ikke gemmes. Ret det, der står i felterne, og prøv igen.",
};
const GENERIC = "Der opstod en fejl. Prøv igen om lidt.";

// Serverens besked bruges kun, hvis den er kort og dansk. Engelske standardfejl fra zod (fx "Invalid input") vises ikke.
const ENGLISH_HINTS = /\b(invalid|expected|too (small|big)|unrecognized|required|received)\b/i;
function usableServerMessage(message: string): string | null {
  const text = message.trim();
  if (text === "" || text.length > 300 || ENGLISH_HINTS.test(text)) return null;
  return text;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ImagePrepareError) return error.message;
  if (error instanceof ApiRequestError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    return usableServerMessage(error.message) ?? NEUTRAL_BY_CODE[error.code] ?? GENERIC;
  }
  return "Der opstod en uventet fejl. Prøv igen om lidt.";
}
