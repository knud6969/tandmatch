import { CHAT_LOW_MESSAGES_WARNING, MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/common/constants/limits";
import { nextCaseFlowStep } from "@/lib/domain/case-flow";
import type { AiChatMessageDto, ChatStateDto } from "@/lib/types/ai";
import type { CaseDto, CaseFlowStep } from "@/lib/types/cases";
import type { SummaryResponse } from "@/lib/types/ai";
import { errorCodeOf } from "./chat-turn";

// Ren logik bag svar-kortene i chatten (architecture 7.9). Ingen React og intet netværk, så den kan testes direkte.

export type CardId = "services" | "timeframe" | "postal_code" | "summary" | "ready";
export type CardMode = "current" | "answered" | "hidden";

const CARD_ORDER: CardId[] = ["services", "timeframe", "postal_code", "summary", "ready"];

// Hvilke kort der vises, og om de er aktuelle (foldet ud) eller besvarede (foldet sammen). Kort efter det aktuelle skjules.
// Ved "chat", "emergency" og "submitted" vises ingen kort: akutsvaret er AI'ens eget, og chatten er skrivebeskyttet, når sagen er sendt.
export function cardModes(step: CaseFlowStep): Record<CardId, CardMode> {
  const modes = { services: "hidden", timeframe: "hidden", postal_code: "hidden", summary: "hidden", ready: "hidden" } as Record<CardId, CardMode>;
  if (step === "chat" || step === "emergency" || step === "submitted") return modes;
  const current = CARD_ORDER.indexOf(step);
  CARD_ORDER.forEach((id, index) => {
    modes[id] = index < current ? "answered" : index === current ? "current" : "hidden";
  });
  return modes;
}

// Behandlingskortet: AI'ens forslag er valgt fra start; har patienten allerede bekræftet, vises det valg.
export function initialServiceSelection(confirmedIds: string[], suggestedIds: string[]): string[] {
  return (confirmedIds.length > 0 ? confirmedIds : suggestedIds).slice(0, MAX_CONFIRMED_SERVICES_PER_CASE);
}

// Slår en behandling til eller fra; loftet gælder bekræftede behandlinger pr. sag.
export function toggleSelection(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= MAX_CONFIRMED_SERVICES_PER_CASE ? selected : [...selected, id];
}

// Markerer, hvilke behandlinger AI'en havde foreslået, så det er tydeligt, at patienten selv har bekræftet dem.
export function toServiceInputs(selected: string[], suggestedIds: string[]): { serviceId: string; suggestedByAi: boolean }[] {
  return selected.map((serviceId) => ({ serviceId, suggestedByAi: suggestedIds.includes(serviceId) }));
}

// "Du har N beskeder tilbage" ved højst CHAT_LOW_MESSAGES_WARNING, men ikke ved 0 (så er samtalen slut).
export function lowMessagesLeft(messagesLeft: number, closed: boolean): number | null {
  return !closed && messagesLeft > 0 && messagesLeft <= CHAT_LOW_MESSAGES_WARNING ? messagesLeft : null;
}

export const isChatLimitCode = (code: string | null) => code === "CHAT_LIMIT";

// Hvad opsummeringskortet gør efter et forsøg på et udkast.
export type SummaryAttempt =
  | { kind: "draft"; text: string; generationsLeft: number; outOfScopeNotice: boolean; retake: SummaryResponse["retakeImages"] }
  // Intet udkast: patienten skriver selv. `message` er en dansk forklaring ved fejl (ikke ved fallback fra serveren).
  | { kind: "write_yourself"; message: string | null; generationsLeft: number | null; outOfScopeNotice: boolean; retake: SummaryResponse["retakeImages"] };

// Et udkast bruges kun, når serveren ikke er gået i fallback; ellers skriver patienten selv.
export function summaryAttemptFromResponse(result: SummaryResponse): SummaryAttempt {
  const common = { generationsLeft: result.generationsLeft, outOfScopeNotice: result.outOfScopeNotice, retake: result.retakeImages };
  if (result.summary && result.fallback === "none") return { kind: "draft", text: result.summary.summaryText, ...common };
  return { kind: "write_yourself", message: null, ...common };
}

// 503 AI_UNAVAILABLE, 429 SUMMARY_LIMIT, 429 ANON_CAP_REACHED og alle andre fejl giver et tomt felt til "Skriv selv".
export function summaryAttemptFromError(error: unknown): SummaryAttempt {
  const code = errorCodeOf(error);
  const message = error instanceof Error && error.message ? error.message : null;
  return {
    kind: "write_yourself",
    message,
    generationsLeft: code === "SUMMARY_LIMIT" || code === "ANON_CAP_REACHED" ? 0 : null,
    outOfScopeNotice: false,
    retake: [],
  };
}

// Kortet laver kun ét automatisk udkast: kun når der hverken er et udkast eller en tekst, og kun hvis det ikke allerede er forsøgt.
export function shouldAutoGenerate(input: { hasDraft: boolean; hasText: boolean; attempted: boolean }): boolean {
  return !input.hasDraft && !input.hasText && !input.attempted;
}

// Appen lader ikke en akut-markering blokere flowet (brugerens beslutning): henvisningen står i AI'ens tekst, og kortene
// vises som normalt. Derfor ses der bort fra `emergency` på beskederne, når det aktuelle trin findes.
export function flowStepForApp(
  caseDto: Pick<CaseDto, "status" | "services" | "preferredTimeframe" | "postalCode" | "summaryApprovedAt">,
  chatState: Pick<ChatStateDto, "messages" | "status" | "readyForSummary">,
): CaseFlowStep {
  const messages = chatState.messages.map((m) => (m.emergency ? { ...m, emergency: false } : m));
  return nextCaseFlowStep(caseDto, { ...chatState, messages });
}

// Hurtigsvar (8.6i): 0-4 korte svar på AI'ens seneste besked. Læses defensivt, indtil typen findes overalt.
export function quickRepliesOf(message: AiChatMessageDto | undefined): string[] {
  const raw = (message as { quickReplies?: unknown } | undefined)?.quickReplies;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string" && r.trim() !== "").slice(0, 4);
}

// Kun under AI'ens seneste svar, og kun når intet svar-kort venter på patienten, samtalen er aktiv, og patienten ikke skriver.
export function visibleQuickReplies(input: {
  messages: AiChatMessageDto[];
  pending: boolean;
  finished: boolean;
  cardActive: boolean;
  typing: boolean;
}): string[] {
  const last = input.messages[input.messages.length - 1];
  if (!last || last.role !== "assistant" || input.pending || input.finished || input.cardActive || input.typing) return [];
  return quickRepliesOf(last);
}
