import { ApiRequestError } from "@/lib/api/client";

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
  // Forespørgsel og samtale (trin 2)
  NOT_FOUND: "Vi kunne ikke finde det, du søgte efter.",
  NOT_DRAFT: "Forespørgslen er sendt og kan ikke ændres længere.",
  CONSENT_REQUIRED: "Du skal give samtykke, før du kan fortsætte.",
  CONSENT_VERSION_MISMATCH: "Samtykketeksten er opdateret. Læs den igen og giv samtykke.",
  CONVERSATION_CLOSED: "Samtalen er lukket. Du kan stadig lave en opsummering.",
  CHAT_LIMIT: "Samtalen har nået grænsen på 30 beskeder. Du kan lave en opsummering af det, du har skrevet.",
  RATE_LIMITED: "Du har sendt mange beskeder i dag. Prøv igen i morgen.",
  AI_TIMEOUT: "AI-assistenten svarede ikke i tide. Din besked er ikke gemt. Prøv igen om lidt.",
  AI_UNAVAILABLE: "AI-assistenten er ikke tilgængelig lige nu. Din besked er ikke gemt. Prøv igen om lidt.",
  SUMMARY_LIMIT: "Du har brugt de mulige udkast til denne forespørgsel. Ret teksten selv i stedet.",
  INVALID_FORM: "Billedet kunne ikke sendes. Prøv et andet billede.",
  MISSING_FILE: "Vælg et billede, før du uploader.",
  FILE_TOO_LARGE: "Billedet er for stort. Vælg et billede på højst 4 MB.",
  IMAGE_LIMIT: "Du kan højst uploade 5 billeder pr. forespørgsel.",
  NO_MATCHES: "Der er ikke fundet tandlæger, der matcher din forespørgsel endnu. Prøv at vælge en større afstand.",
  ACCOUNT_REQUIRED: "Opret en konto for at sende forespørgslen til tandlæger.",
  SUMMARY_NOT_APPROVED: "Godkend opsummeringen, før forespørgslen sendes.",
  POSTAL_CODE_REQUIRED: "Angiv dit postnummer, før forespørgslen sendes.",
  DRAFT_EXISTS: "Du har allerede en forespørgsel i gang.",
  // Tandlæger og svar (trin 3)
  NOT_VERIFIED: "Din profil er endnu ikke verificeret. Du kan først svare på forespørgsler, når en administrator har godkendt dig.",
  REQUEST_CLOSED: "Forespørgslen er ikke længere åben for svar. Den er lukket eller udløbet.",
  ALREADY_RESPONDED: "Du har allerede svaret på denne forespørgsel. Du kan rette dit eksisterende svar.",
  RESPONSE_LOCKED: "Patienten har truffet et valg, så svaret kan ikke ændres længere.",
  RESPONSE_WITHDRAWN: "Svaret er trukket tilbage og kan ikke ændres igen.",
  STATE_CHANGED: "Svaret kunne ikke gemmes, fordi forespørgslen er ændret. Vi har hentet de nyeste oplysninger. Prøv igen.",
  POSTAL_CODE_UNKNOWN: "Postnummeret findes ikke i postnummerlisten. Tjek det og prøv igen.",
  // Patientens valg af svar (trin 4)
  ALREADY_DECIDED: "Du har allerede truffet et valg for dette svar. Opdater siden for at se den nyeste status.",
  INVALID_DECISION: "Valget kunne ikke gemmes. Prøv igen.",
};

// Fejl, der betyder, at visningen er forældet. Siden bør hente data igen.
export const STALE_STATE_CODES = [
  "REQUEST_CLOSED",
  "ALREADY_RESPONDED",
  "RESPONSE_LOCKED",
  "RESPONSE_WITHDRAWN",
  "STATE_CHANGED",
  "ALREADY_DECIDED",
  "NOT_FOUND",
] as const;

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
