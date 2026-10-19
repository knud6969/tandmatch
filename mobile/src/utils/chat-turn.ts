import { GENERIC_ERROR_TEXT } from "@/lib/constants/error-texts";
import type { ChatTurnResponse } from "@/lib/types/ai";

// Ren chatlogik uden React og uden netværk (architecture 10.6): hvad en tur gav, og hvad skærmen skal gøre bagefter.
export type TurnOutcome =
  | { kind: "ok"; turn: ChatTurnResponse }
  // 403 CONSENT_REQUIRED: beskeden er ikke gemt; vis samtykke-gaten, og lad patienten sende igen bagefter.
  | { kind: "consent_required" }
  // 503 AI_UNAVAILABLE: beskeden og et fast svar er allerede gemt, og turen er brugt. Hent samtalen igen; send ikke beskeden igen.
  | { kind: "saved_without_reply" }
  // Alt andet: beskeden er ikke gemt, så patienten kan prøve igen uden at skrive forfra.
  | { kind: "failed"; message: string; code: string | null };

export function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

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
