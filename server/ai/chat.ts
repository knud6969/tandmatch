import "server-only";
import type { AiChatTurn, OutOfScopeTopic } from "@/lib/types/ai";
import type { CosmeticCategory } from "@/lib/types/common";
import { AI_TIMEOUT_MS } from "@/lib/constants/limits";

// GRÆNSEFLADE til AI-laget (ai-flow-agenten ejer implementeringen).
// Routen kalder kun sendChatTurn(). Prompt, guardrails og output-validering bor bag denne funktion.
// Denne fil er en STUB: den returnerer en fast besked og kalder ikke OpenAI.

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export type SendChatTurnInput = {
  category: CosmeticCategory;
  history: ChatHistoryItem[]; // seneste beskeder (max 20), ældre sendes ikke
  userMessage: string;
};

export type ChatTurnResult = AiChatTurn & {
  // true hvis guardrails har erstattet svaret med den faste tekst (ai-flow-agenten sætter flaget).
  blocked: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
};

export class AiTimeoutError extends Error {
  constructor() {
    super("AI-kaldet fik timeout");
    this.name = "AiTimeoutError";
  }
}

export async function sendChatTurn(input: SendChatTurnInput): Promise<ChatTurnResult> {
  return withTimeout(stubChatTurn(input), AI_TIMEOUT_MS);
}

// STUB: fast svar uden AI. Erstattes af ai-flow-agenten.
async function stubChatTurn(input: SendChatTurnInput): Promise<ChatTurnResult> {
  return {
    reply: `Tak for din beskrivelse (${input.history.length} tidligere beskeder). Chatten er under opsætning, så dit svar er midlertidigt.`,
    outOfScopeTopics: [],
    readyForSummary: false,
    blocked: false,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Dagligt loft for AI-kald fra anonyme sessioner (AI_ANON_DAILY_CAP, architecture 2.3). Fallback 300.
export function anonymousDailyCap(): number {
  const parsed = Number(process.env.AI_ANON_DAILY_CAP);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 300;
}
