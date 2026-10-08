"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { AiDisclaimer } from "@/views/components/ui/disclaimer";
import { TextArea } from "@/views/components/ui/text-area";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { AI_BOUNDARY_TEXT, CHAT_NOT_SHARED_TEXT, OUT_OF_SCOPE_NOTICE } from "@/lib/constants/ai-texts";
import { CHAT_MAX_CHARS, CHAT_MAX_USER_MESSAGES_PER_CONVERSATION } from "@/lib/constants/limits";
import type { AiChatMessageDto, ChatStateDto, ChatTurnResponse } from "@/lib/types/requests";

type ChatPanelProps = {
  requestId: string;
  // Kaldes når patienten vil gå videre til opsummeringen.
  onGoToSummary: () => void;
  // Kaldes efter hvert forsøg på at sende en besked (også ved fejl), så forælderen henter kladden igen.
  onTurnSettled?: () => Promise<void>;
};

const MESSAGE_LOW_WATER = 5;

// Venlige danske fejl for en chatbesked. Serverfejl (500) og konflikter (409) får en fast tekst.
function turnErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status >= 500) {
      return "Der skete en fejl på serveren, og din besked er ikke gemt. Prøv igen om lidt.";
    }
    if (err.status === 409 && !["CONVERSATION_CLOSED", "NOT_DRAFT"].includes(err.code)) {
      return "Samtalen kan ikke fortsætte lige nu. Din besked er ikke gemt. Prøv igen om lidt.";
    }
  }
  return apiErrorMessage(err);
}

// Chatpanel til kosmetisk spor. Viser både patientens og AI’ens beskeder og de faste grænse-tekster.
// AI-svar vises først, når serveren har valideret dem (architecture 7.5). Ingen streaming.
export function ChatPanel({ requestId, onGoToSummary, onTurnSettled }: ChatPanelProps) {
  const headingId = useId();
  const inputId = useId();
  const [chat, setChat] = useState<ChatStateDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<ChatStateDto>(`/api/requests/${requestId}/chat`)
      .then((state) => {
        if (!active) return;
        setChat(state);
        setClosed(state.status === "closed");
      })
      .catch((err: unknown) => {
        if (active) setLoadError(apiErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const trimmed = draft.trim();
  const messagesLeft = chat?.messagesLeft ?? CHAT_MAX_USER_MESSAGES_PER_CONVERSATION;
  const canSend = !pending && !closed && trimmed.length > 0 && trimmed.length <= CHAT_MAX_CHARS;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setPending(true);
    setSendError(null);
    try {
      const turn = await apiRequest<ChatTurnResponse>(`/api/requests/${requestId}/chat`, {
        method: "POST",
        body: { message: trimmed },
      });
      setChat((current) => ({
        conversationId: current?.conversationId ?? null,
        status: turn.messagesLeft === 0 ? "closed" : (current?.status ?? "active"),
        messages: [...(current?.messages ?? []), turn.userMessage, turn.assistantMessage],
        messagesLeft: turn.messagesLeft,
        readyForSummary: turn.readyForSummary,
      }));
      if (turn.messagesLeft === 0) setClosed(true);
      setDraft("");
    } catch (err) {
      // Ved fejl er beskeden ikke gemt. Teksten bliver stående, så patienten kan sende den igen.
      setSendError(turnErrorMessage(err));
      if (err instanceof ApiRequestError && (err.code === "CHAT_LIMIT" || err.code === "CONVERSATION_CLOSED")) {
        setClosed(true);
      }
    } finally {
      setPending(false);
      // Serveren nulstiller godkendelsen af opsummeringen ved ny besked. Kladden hentes derfor igen.
      if (onTurnSettled) await onTurnSettled();
    }
  }

  if (loadError) {
    return (
      <Alert tone="danger" role="alert" title="Samtalen kunne ikke hentes">
        <p>{loadError}</p>
      </Alert>
    );
  }
  if (!chat) {
    return <p role="status" className="text-base text-ink-muted">Henter samtalen …</p>;
  }

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 id={headingId} className="text-lg font-semibold text-ink">
          Beskriv dit ønske med egne ord
        </h3>
        <p className="text-base leading-relaxed text-ink-muted">
          AI-assistenten stiller spørgsmål, så din beskrivelse bliver tydelig. Du kan svare så kort eller langt, du vil.
        </p>
      </div>

      <AiDisclaimer />

      <p className="text-sm text-ink-muted">{CHAT_NOT_SHARED_TEXT}</p>

      {chat.messages.length > 0 && (
        <ol aria-label="Samtalen" aria-live="polite" className="flex flex-col gap-3">
          {chat.messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </ol>
      )}

      {lastAssistant?.outOfScopeTopics.length ? (
        <Alert tone="info" title="Tandlægens opgave">
          <p>{OUT_OF_SCOPE_NOTICE}</p>
        </Alert>
      ) : null}

      {chat.readyForSummary && (
        <Alert tone="success" title="Der er nok til et udkast">
          <p>Du kan lave en opsummering nu. Du kan stadig skrive mere, hvis der er noget, du vil tilføje.</p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={onGoToSummary}>
            Gå til opsummering
          </Button>
        </Alert>
      )}

      {closed ? (
        <Alert tone="warning" title="Samtalen er lukket">
          <p>
            Der kan ikke skrives flere beskeder i denne samtale. Du kan stadig lave en opsummering af det, du har skrevet.
          </p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={onGoToSummary}>
            Gå til opsummering
          </Button>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          {sendError && (
            <Alert tone="danger" role="alert">
              {sendError}
            </Alert>
          )}
          <TextArea
            id={inputId}
            label="Din besked"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={CHAT_MAX_CHARS}
            disabled={pending}
            hint={
              <span>
                Skriv det, der er vigtigt for dig. {trimmed.length}/{CHAT_MAX_CHARS} tegn. Du har {messagesLeft} beskeder
                tilbage i denne samtale.
              </span>
            }
          />
          {pending && (
            <p role="status" className="text-sm font-medium text-ink-muted">
              AI-assistenten skriver …
            </p>
          )}
          <Button type="submit" fullWidth className="sm:w-auto" disabled={!canSend}>
            Send besked
          </Button>
          {messagesLeft <= MESSAGE_LOW_WATER && (
            <p className="text-sm font-medium text-warning-ink">
              Du er tæt på grænsen for beskeder i denne samtale.
            </p>
          )}
        </form>
      )}

      <p className="text-xs text-ink-muted">{AI_BOUNDARY_TEXT}</p>
    </section>
  );
}

function ChatBubble({ message }: { message: AiChatMessageDto }) {
  const isUser = message.role === "user";
  return (
    <li className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-3 text-base leading-relaxed text-white"
            : message.blocked
              ? "max-w-[85%] rounded-2xl rounded-bl-sm border border-warning-line bg-warning-bg px-4 py-3 text-base leading-relaxed text-warning-ink"
              : "max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink"
        }
      >
        <p className="mb-1 text-xs font-semibold opacity-80">
          {isUser ? "Dig" : message.blocked ? "AI-assistent (fast svar)" : "AI-assistent"}
        </p>
        {/* Ren tekst, aldrig HTML (architecture 12.1). */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </li>
  );
}
