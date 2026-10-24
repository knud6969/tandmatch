import { GENERIC_ERROR_TEXT } from "@/lib/common/constants/error-texts";
import type { ChatTurnResponse, ImageTurnResponse } from "@/lib/cases/types/ai";

// Ren chatlogik uden React og uden netværk (architecture 10.6): hvad en tur gav, og hvad skærmen skal gøre bagefter.
export type TurnOutcome =
  | { kind: "ok"; turn: ChatTurnResponse }
  // 403 CONSENT_REQUIRED: beskeden er ikke gemt; vis samtykke-gaten, og lad patienten sende igen bagefter.
  | { kind: "consent_required" }
  // 503 AI_UNAVAILABLE: beskeden og et fast svar er allerede gemt, og turen er brugt. Hent samtalen igen; send ikke beskeden igen.
  | { kind: "saved_without_reply" }
  // Alt andet: beskeden er ikke gemt, så patienten kan prøve igen uden at skrive forfra.
  | { kind: "failed"; message: string; code: string | null };

// Fejlkoden fra ApiRequestError uden at importere klassen, så filen forbliver ren og let at teste.
export function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

// Sender én besked og oversætter resultatet til et udfald; kaster aldrig.
export async function runChatTurn(send: () => Promise<ChatTurnResponse>): Promise<TurnOutcome> {
  try {
    return { kind: "ok", turn: await send() };
  } catch (error) {
    const code = errorCodeOf(error);
    if (code === "CONSENT_REQUIRED") return { kind: "consent_required" };
    if (code === "AI_UNAVAILABLE") return { kind: "saved_without_reply" };
    return { kind: "failed", code, message: error instanceof Error && error.message ? error.message : GENERIC_ERROR_TEXT };
  }
}

// Billedturen (7.9c): AI'en reagerer selv efter en upload-batch. Intet at gentage for patienten, så udfaldene er få.
export type ImageTurnOutcome =
  | { kind: "ok"; turn: ImageTurnResponse }
  // 409 NO_NEW_IMAGES (intet nyt at se) og 429 CHAT_LIMIT (samtalen er lukket): ignoreres stille. `chatLimit` lukker chatten i appen.
  | { kind: "skipped"; chatLimit: boolean }
  // Vises kort. `retry`: patienten kan trykke "Prøv igen" (billederne er stadig ikke set af AI'en).
  | { kind: "failed"; code: string | null; message: string; retry: boolean };

export const IMAGE_TURN_TEXTS = {
  consent: "Samtykket mangler. Giv samtykke, og prøv igen.",
  rateLimited: "Der er sendt mange beskeder lige nu. Prøv igen om lidt.",
  anonCap: "AI'en har nået dagens grænse. Prøv igen i morgen.",
  unavailable: "AI'en svarer ikke lige nu. Billedet er gemt.",
} as const;

// Oversætter fejlen fra billedturen til et udfald; kaster aldrig.
export async function runImageTurn(send: () => Promise<ImageTurnResponse>): Promise<ImageTurnOutcome> {
  try {
    return { kind: "ok", turn: await send() };
  } catch (error) {
    const code = errorCodeOf(error);
    switch (code) {
      case "NO_NEW_IMAGES":
        return { kind: "skipped", chatLimit: false };
      case "CHAT_LIMIT":
        return { kind: "skipped", chatLimit: true };
      case "CONSENT_REQUIRED":
        return { kind: "failed", code, message: IMAGE_TURN_TEXTS.consent, retry: true };
      case "RATE_LIMITED":
        return { kind: "failed", code, message: IMAGE_TURN_TEXTS.rateLimited, retry: false };
      case "ANON_CAP_REACHED":
      case "ANON_USER_LIMIT":
        return { kind: "failed", code, message: IMAGE_TURN_TEXTS.anonCap, retry: false };
      case "AI_UNAVAILABLE":
        return { kind: "failed", code, message: IMAGE_TURN_TEXTS.unavailable, retry: true };
      default:
        return { kind: "failed", code, message: error instanceof Error && error.message ? error.message : GENERIC_ERROR_TEXT, retry: false };
    }
  }
}
