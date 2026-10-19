import { useCallback, useState } from "react";
import { getChat, sendChatMessage } from "~/api/chat";
import type { AiChatMessageDto } from "@/lib/types/ai";
import { runChatTurn, type TurnOutcome } from "~/utils/chat-turn";
import { useLoad } from "./use-load";

// Samtalen med AI-assistenten for én sag (architecture 10.6). Beskeder fra serveren plus de nye ture i denne session.
export function useChat(caseId: string, onTurn: () => void) {
  const chat = useLoad(useCallback(() => getChat(caseId), [caseId]), [caseId]);
  const [extra, setExtra] = useState<AiChatMessageDto[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [messagesLeft, setMessagesLeft] = useState<number | null>(null);

  const state = chat.data;
  const messages = [...(state?.messages ?? []), ...extra];

  const send = useCallback(
    async (text: string): Promise<TurnOutcome> => {
      setPending(text);
      const outcome = await runChatTurn(() => sendChatMessage(caseId, text));
      if (outcome.kind === "ok") {
        setExtra((current) => [...current, outcome.turn.userMessage, outcome.turn.assistantMessage]);
        setReady(outcome.turn.readyForSummary);
        setMessagesLeft(outcome.turn.messagesLeft);
        onTurn();
      } else if (outcome.kind === "consent_required") {
        setNeedsConsent(true);
      } else if (outcome.kind === "saved_without_reply") {
        // Hent samtalen igen i stedet for at lægge beskeden tilbage, så den ikke sendes to gange.
        setExtra([]);
        setReady(null);
        setMessagesLeft(null);
        chat.reload();
      }
      setPending(null);
      return outcome;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [caseId, onTurn, chat.reload],
  );

  return {
    loading: chat.loading && !state,
    error: chat.error,
    reload: chat.reload,
    messages,
    pending,
    needsConsent,
    clearNeedsConsent: () => setNeedsConsent(false),
    ready: ready ?? state?.readyForSummary ?? false, // bruges af det kommende flow (AI'en har nok til en opsummering)
    messagesLeft: messagesLeft ?? state?.messagesLeft ?? 0,
    closed: state?.status === "closed",
    send,
  };
}
