import { CHAT_MAX_USER_MESSAGES_PER_CONVERSATION, MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGES_PER_CASE } from "@/lib/constants/limits";
import { ApiRequestError } from "@/views/utils/api-client";

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
  UNAUTHENTICATED: "Din session er udløbet. Log ind igen.",
  PROFILE_MISSING: "Kontoen er ikke klar endnu. Prøv igen om lidt.",
  NETWORK: "Vi kunne ikke oprette forbindelse. Tjek din internetforbindelse og prøv igen.",
  NOT_FOUND: "Vi kunne ikke finde det, du søgte efter.",
  CONSENT_REQUIRED: "Du skal give samtykke, før du kan fortsætte.",
  CONSENT_VERSION_MISMATCH: "Samtykketeksten er opdateret. Læs den igen og giv samtykke.",
  CONVERSATION_CLOSED: "Samtalen er lukket. Du kan stadig lave en opsummering.",
  CHAT_LIMIT: `Samtalen har nået grænsen på ${CHAT_MAX_USER_MESSAGES_PER_CONVERSATION} beskeder. Du kan lave en opsummering af det, du har skrevet.`,
  RATE_LIMITED: "Du har sendt mange beskeder i dag. Prøv igen i morgen.",
  AI_TIMEOUT: "AI-assistenten svarede ikke i tide. Din besked er ikke gemt. Prøv igen om lidt.",
  AI_UNAVAILABLE: "AI-assistenten er ikke tilgængelig lige nu. Din besked er ikke gemt. Prøv igen om lidt.",
  SUMMARY_LIMIT: "Du har brugt de mulige udkast til denne sag. Ret teksten selv i stedet.",
  INVALID_FORM: "Billedet kunne ikke sendes. Prøv et andet billede.",
  MISSING_FILE: "Vælg et billede, før du uploader.",
  FILE_TOO_LARGE: `Billedet er for stort. Vælg et billede på højst ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} MB.`,
  IMAGE_LIMIT: `Du kan højst uploade ${MAX_IMAGES_PER_CASE} billeder pr. sag.`,
  ACCOUNT_REQUIRED: "Opret en konto for at fortsætte.",
  SUMMARY_NOT_APPROVED: "Godkend opsummeringen, før sagen sendes.",
  POSTAL_CODE_REQUIRED: "Angiv dit postnummer, før sagen sendes.",
  POSTAL_CODE_UNKNOWN: "Postnummeret findes ikke i postnummerlisten. Tjek det og prøv igen.",
  ALREADY_WITHDRAWN: "Samtykket er allerede trukket tilbage.",
  EXPORT_FAILED: "Dine data kunne ikke hentes lige nu. Prøv igen om lidt.",
  CLINIC_EXISTS: "Der findes allerede en klinik med dette CVR-nummer, som er knyttet til en konto. Kontakt os, hvis det er din klinik.",
  TRUSTPILOT_URL_REQUIRED: "Angiv linket til din Trustpilot-side, hvis du angiver score eller antal anmeldelser.",
  UNKNOWN_SERVICE: "En af ydelserne findes ikke længere i kataloget. Genindlæs siden og prøv igen.",
  DENTIST_LIMIT: "Du kan højst oprette 30 tandlæger.",
  PORTFOLIO_LIMIT: "Du kan højst have 60 porteføljebilleder.",
  INVALID_IMAGE: "Billedet kunne ikke bruges. Vælg et JPEG- eller PNG-billede.",
  INVALID_REVIEW: "Anmeldelsen kunne ikke gemmes. Tjek felterne og prøv igen.",
};

// Neutrale tekster, når serverens besked ikke kan vises som den står.
const NEUTRAL_BY_CODE: Record<string, string> = {
  VALIDATION_ERROR: "Oplysningerne kunne ikke gemmes. Ret det, der står i felterne, og prøv igen.",
};
const GENERIC = "Der opstod en fejl. Prøv igen om lidt.";

// Serverens besked bruges kun, hvis den er kort og dansk. Engelske standardfejl fra zod (fx "Invalid input") vises ikke.
const ENGLISH_HINTS = /\b(invalid|expected|too (small|big)|unrecognized|required|received)\b/i;
export function usableServerMessage(message: string): string | null {
  const text = message.trim();
  if (text === "" || text.length > 300 || ENGLISH_HINTS.test(text)) return null;
  return text;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    return usableServerMessage(error.message) ?? NEUTRAL_BY_CODE[error.code] ?? GENERIC;
  }
  return "Der opstod en uventet fejl. Prøv igen om lidt.";
}
