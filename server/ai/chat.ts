import "server-only";
import { AI_TIMEOUT_MS } from "@/lib/constants/limits";
import { runChatGuard, type ChatGuardResult } from "@/server/ai/guard";
import { callStructured, type ModelMessage } from "@/server/ai/openai";
import { CHAT_INSTRUCTIONS } from "@/server/ai/prompts/chat.v1";
import { CHAT_TURN_JSON_SCHEMA } from "@/server/ai/schemas";
import { maskPii } from "@/server/ai/pii";
import { FORM_LABELS } from "@/server/ai/form-labels";
import { formatFormData, wrapAssistantText, wrapPatientInput } from "@/server/ai/prompt-format";

export { AiInvalidOutputError, AiTimeoutError, AiUnavailableError } from "@/server/ai/errors";

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export type SendChatTurnInput = {
  category: string;
  answers?: Record<string, string | string[]>;
  history: ChatHistoryItem[]; // seneste beskeder (max 20), ældre sendes ikke
  userMessage: string;
};

export type ChatTurnResult = ChatGuardResult;

function buildMessages(input: SendChatTurnInput): ModelMessage[] {
  const messages: ModelMessage[] = [
    { role: "user", content: formatFormData(input.category, input.answers ?? {}, FORM_LABELS) },
  ];
  for (const item of input.history) {
    messages.push(
      item.role === "user"
        ? { role: "user", content: wrapPatientInput(maskPii(item.content)) }
        : { role: "assistant", content: wrapAssistantText(item.content) },
    );
  }
  messages.push({ role: "user", content: wrapPatientInput(maskPii(input.userMessage)) });
  return messages;
}

// Én patientbesked og ét validiseret svar. Upstream-fejl (timeout, nede) kastes videre til routen (503).
export async function sendChatTurn(input: SendChatTurnInput): Promise<ChatTurnResult> {
  const messages = buildMessages(input);
  const result = await runChatGuard(
    {
      category: input.category,
      answers: input.answers ?? {},
      history: input.history,
      userMessage: input.userMessage,
    },
    (retryReminder) =>
      callStructured({
        instructions: retryReminder ? `${CHAT_INSTRUCTIONS}\n\n${retryReminder}` : CHAT_INSTRUCTIONS,
        messages,
        schemaName: "chat_turn",
        schema: CHAT_TURN_JSON_SCHEMA,
        maxOutputTokens: 600,
        timeoutMs: AI_TIMEOUT_MS,
      }),
  );
  return result;
}
