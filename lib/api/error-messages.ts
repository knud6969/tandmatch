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
};

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return MESSAGES[error.code] ?? error.message;
  }
  return "Der opstod en uventet fejl. Prøv igen om lidt.";
}
