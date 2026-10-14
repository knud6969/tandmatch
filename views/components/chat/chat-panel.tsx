"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AI_BOUNDARY_TEXT,
  EMERGENCY_REFERRAL_TEXT,
  LIFE_THREATENING_REFERRAL_TEXT,
  OUT_OF_SCOPE_NOTICES,
  PRELIMINARY_ASSESSMENT_LABEL,
} from "@/lib/constants/ai-texts";
import { CHAT_MAX_CHARS } from "@/lib/constants/limits";
import type { AiChatMessageDto, ChatStateDto, ChatTurnResponse } from "@/lib/types/ai";
import { ConsentGate } from "@/views/components/case/consent-gate";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { cx } from "@/views/components/ui/cx";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest, ApiRequestError } from "@/views/utils/api-client";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

const WELCOME =
  "Hej. Beskriv med dine egne ord, hvad du oplever, eller hvad du gerne vil have lavet, fx hvor det sidder, og hvor længe du har haft det. Jeg hjælper dig med at sætte ord på det, så klinikkerne forstår dit behov. Jeg kan ikke stille diagnoser eller sige, hvad det koster.";

function AssistantExtras({ message }: { message: AiChatMessageDto }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {message.emergency && (
        <Alert tone="danger" title="Det kan være akut" role="alert">
          <p data-testid="akut-blok">{EMERGENCY_REFERRAL_TEXT}</p>
          <p className="mt-2">{LIFE_THREATENING_REFERRAL_TEXT}</p>
          <p className="mt-2">
            <Link href="/klinikker?akut=1" className="font-semibold">
              Se klinikker med ledig akuttid
            </Link>
          </p>
        </Alert>
      )}
      {message.preliminaryAssessment && (
        <div className="rounded-control border border-warning-line bg-warning-bg p-3 text-warning-ink" data-testid="foreloebig-vurdering">
          <p className="mb-1">
            <Badge tone="warning">Foreløbig – klinikken vurderer endeligt</Badge>
          </p>
          <p className="text-base leading-relaxed">{message.preliminaryAssessment}</p>
          <p className="mt-1 text-sm">{PRELIMINARY_ASSESSMENT_LABEL}</p>
        </div>
      )}
      {message.outOfScopeTopics.map((topic) => (
        <Alert key={topic} tone="info">
          {OUT_OF_SCOPE_NOTICES[topic]}
        </Alert>
      ))}
      {message.suggestedServices.length > 0 && (
        <div data-testid="forslag">
          <p className="text-sm font-semibold text-ink">Behandlinger, din beskrivelse kan passe til. Du bekræfter selv i næste trin:</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {message.suggestedServices.map((service) => (
              <li key={service.id}>
                <Badge tone="brand">{service.name}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: AiChatMessageDto }) {
  const mine = message.role === "user";
  return (
    <li className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[92%] rounded-card px-4 py-3 text-base leading-relaxed sm:max-w-[80%]",
          mine ? "bg-brand-600 text-on-brand" : "bg-surface-muted text-ink",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {!mine && <AssistantExtras message={message} />}
      </div>
    </li>
  );
}

type Props = {
  caseId: string;
  aiConsentGiven: boolean;
  onAiConsent: () => void;
  // Kaldes efter hver tur, så sagens forslag kan hentes igen.
  onTurn: () => void;
  onContinue: () => void;
};

// Samtalen med AI-assistenten (architecture 6.1, 7, 10.6). Fast tekst om AI'ens grænser, foreløbige vurderinger med mærkat,
// akut-blok og forslag til behandlinger. Inputfeltet står fast i bunden af panelet.
export function ChatPanel({ caseId, aiConsentGiven, onAiConsent, onTurn, onContinue }: Props) {
  const loader = useCallback(() => apiRequest<ChatStateDto>(`/api/cases/${caseId}/chat`), [caseId]);
  const chat = useLoad(loader);
  const [extra, setExtra] = useState<AiChatMessageDto[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [needsConsent, setNeedsConsent] = useState(false);
  const [readyOverride, setReadyOverride] = useState<boolean | null>(null);
  const [messagesLeftOverride, setMessagesLeftOverride] = useState<number | null>(null);
  const action = useAction();
  const listRef = useRef<HTMLUListElement>(null);

  const state = chat.data;
  const messages = [...(state?.messages ?? []), ...extra];
  const messagesLeft = messagesLeftOverride ?? state?.messagesLeft ?? 0;
  const ready = readyOverride ?? state?.readyForSummary ?? false;
  const hasUserMessage = messages.some((m) => m.role === "user");
  const blockedByConsent = !aiConsentGiven || needsConsent;

  useEffect(() => {
    // Kun listen ruller, ikke siden, så inputfeltet bliver stående i bunden.
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || action.busy) return;
    setPending(text);
    setDraft("");
    const ok = await action.run(async () => {
      try {
        const turn = await apiRequest<ChatTurnResponse>(`/api/cases/${caseId}/chat`, { method: "POST", body: { message: text } });
        setExtra((current) => [...current, turn.userMessage, turn.assistantMessage]);
        setReadyOverride(turn.readyForSummary);
        setMessagesLeftOverride(turn.messagesLeft);
        onTurn();
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "CONSENT_REQUIRED") setNeedsConsent(true);
        throw error;
      }
    });
    if (!ok) setDraft(text); // beskeden er ikke gemt, så patienten kan prøve igen uden at skrive den forfra
    setPending(null);
  }

  if (chat.loading && !state) return <LoadState loading error={null} onRetry={chat.reload} />;
  if (chat.error) return <LoadState loading={false} error={chat.error} onRetry={chat.reload} />;

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">
        <p className="font-semibold">{AI_BOUNDARY_TEXT}</p>
      </Alert>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <ul
          ref={listRef}
          className="flex max-h-[52dvh] min-h-48 flex-col gap-3 overflow-y-auto p-4 sm:max-h-[60dvh] sm:p-5"
          aria-label="Samtale med AI-assistenten"
          aria-live="polite"
        >
          <Bubble
            message={{
              id: "velkommen",
              role: "assistant",
              content: WELCOME,
              preliminaryAssessment: null,
              suggestedServices: [],
              emergency: false,
              outOfScopeTopics: [],
              blocked: false,
              createdAt: "",
            }}
          />
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {pending && (
            <>
              <li className="flex justify-end">
                <div className="max-w-[92%] rounded-card bg-brand-600 px-4 py-3 text-base text-on-brand sm:max-w-[80%]">
                  <p className="whitespace-pre-wrap break-words">{pending}</p>
                </div>
              </li>
              <li className="text-sm text-ink-muted" role="status">
                AI-assistenten skriver …
              </li>
            </>
          )}
                  </ul>

        <div className="sticky bottom-0 border-t border-line bg-surface p-3 sm:p-4">
          {blockedByConsent ? (
            <ConsentGate
              type="ai_processing"
              onGranted={() => {
                setNeedsConsent(false);
                onAiConsent();
              }}
            />
          ) : state?.status === "closed" || messagesLeft === 0 ? (
            <Alert tone="info">Samtalen er slut. Du kan gå videre med det, du har skrevet.</Alert>
          ) : (
            <form onSubmit={send} className="flex flex-col gap-2">
              <StatusMessage message={action.message} />
              <label htmlFor="chat-besked" className="sr-only">
                Din besked til AI-assistenten
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id="chat-besked"
                  rows={2}
                  value={draft}
                  maxLength={CHAT_MAX_CHARS}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) void send(event);
                  }}
                  placeholder="Beskriv dit problem …"
                  className="min-h-12 w-full resize-none rounded-control border border-field-border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted/70"
                />
                <Button type="submit" disabled={action.busy || draft.trim() === ""} className="shrink-0">
                  Send
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          {ready ? "Du har fortalt nok til at gå videre. Du kan også skrive mere." : "Du kan gå videre, når du har beskrevet dit behov."}
        </p>
        <Button variant={ready ? "primary" : "secondary"} onClick={onContinue} disabled={!hasUserMessage}>
          Fortsæt til billeder
        </Button>
      </div>
    </div>
  );
}
