import { useCallback, useState } from "react";
import { getChat, sendChatMessage, sendImageTurn } from "~/api/chat";
import type { AiChatMessageDto } from "@/lib/cases/types/ai";
import { isChatLimitCode, stickyReady } from "~/utils/case-cards";
import { runChatTurn, runImageTurn, type TurnOutcome } from "~/utils/chat-turn";
import { useLoad } from "./use-load";

// Samtalen med AI-assistenten for én sag (architecture 10.6). Beskeder fra serveren plus de nye ture i denne session.
export function useChat(caseId: string, onTurn: () => void) {
  const chat = useLoad(useCallback(() => getChat(caseId), [caseId]), [caseId]);
  const [extra, setExtra] = useState<AiChatMessageDto[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [messagesLeft, setMessagesLeft] = useState<number | null>(null);
  // 429 CHAT_LIMIT: samtalen er lukket ved loftet, selv om vores egen tilstand ikke vidste det.
  const [limitHit, setLimitHit] = useState(false);

  // Billedturen: AI'en reagerer selv på nye billeder. Kvaliteten vises med det samme, før sagen er hentet igen.
  const [imageTurning, setImageTurning] = useState(false);
  const [imageNotice, setImageNotice] = useState<{ message: string; retry: boolean } | null>(null);
  const [assessed, setAssessed] = useState<Record<string, string | null>>({});

  const state = chat.data;
  const messages = [...(state?.messages ?? []), ...extra];

  // Hver tur giver ét udfald (runChatTurn), og hvert udfald har sin egen opfølgning her.
  const send = useCallback(
    async (text: string): Promise<TurnOutcome> => {
      setPending(text);
      const outcome = await runChatTurn(() => sendChatMessage(caseId, text));
      if (outcome.kind === "ok") {
        setExtra((current) => [...current, outcome.turn.userMessage, outcome.turn.assistantMessage]);
        setReady((previous) => stickyReady(previous, outcome.turn.readyForSummary));
        setMessagesLeft(outcome.turn.messagesLeft);
        onTurn();
      } else if (outcome.kind === "consent_required") {
        setNeedsConsent(true);
      } else if (outcome.kind === "failed" && isChatLimitCode(outcome.code)) {
        setLimitHit(true);
        chat.reload();
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

  const imageTurn = useCallback(async () => {
    setImageTurning(true);
    setImageNotice(null);
    const outcome = await runImageTurn(() => sendImageTurn(caseId));
    if (outcome.kind === "ok") {
      const { turn } = outcome;
      setExtra((current) => [...current, turn.assistantMessage]);
      setReady((previous) => stickyReady(previous, turn.readyForSummary));
      setMessagesLeft(turn.messagesLeft);
      setAssessed((current) => ({ ...current, ...Object.fromEntries(turn.assessedImages.map((image) => [image.imageId, image.quality])) }));
      onTurn();
    } else if (outcome.kind === "skipped") {
      if (outcome.chatLimit) {
        setLimitHit(true);
        chat.reload();
      }
    } else {
      if (outcome.code === "CONSENT_REQUIRED") setNeedsConsent(true);
      setImageNotice({ message: outcome.message, retry: outcome.retry });
    }
    setImageTurning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, onTurn, chat.reload]);

  return {
    imageTurn,
    imageTurning,
    imageNotice,
    assessedQuality: assessed,
    loading: chat.loading && !state,
    error: chat.error,
    reload: chat.reload,
    messages,
    pending,
    needsConsent,
    clearNeedsConsent: () => setNeedsConsent(false),
    ready: ready === true || (state?.readyForSummary ?? false), // klæbende: AI'en har nok til en opsummering
    messagesLeft: limitHit ? 0 : (messagesLeft ?? state?.messagesLeft ?? 0),
    // Lukket ved loftet: serverens status, 429 CHAT_LIMIT eller ingen beskeder tilbage. Kortene virker stadig.
    closed: state?.status === "closed" || limitHit || (state !== null && (messagesLeft ?? state.messagesLeft) <= 0),
    send,
  };
}
