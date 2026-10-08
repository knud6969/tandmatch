"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { MESSAGE_MAX_CHARS } from "@/lib/constants/limits";
import { formatDateTime } from "@/views/utils/format";
import type { MessageDto } from "@/lib/types/messages";

// Fast polling, så den anden part ser nye beskeder uden at skulle genindlæse siden (architecture 10.7: MVP bruger polling).
const POLL_MS = 15_000;

type State =
  | { status: "loading" }
  | { status: "ready"; messages: MessageDto[] }
  | { status: "error"; message: string };

type MessageThreadProps = {
  responseId: string;
  // Hvad modtagne beskeder mærkes med. Aldrig et navn (architecture 4.4): "Tandlægen" eller "Patienten".
  counterpartLabel: string;
};

// Beskedtråd bundet til ét svar: altid præcis én patient og én tandlæge (architecture 4.3, 10.7). Intet AI-indhold.
export function MessageThread({ responseId, counterpartLabel }: MessageThreadProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  // Sat når en 401/404 viser, at tråden ikke findes eller ikke må læses længere. Pollingen stopper permanent,
  // og beskeden beholder den sidst kendte liste i stedet for at blive erstattet af en fejlboks.
  const [blocked, setBlocked] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function startPolling() {
      if (intervalId === null && !stopped && !document.hidden) {
        intervalId = setInterval(load, POLL_MS);
      }
    }

    function load() {
      if (stopped) return;
      apiRequest<{ messages: MessageDto[] }>(`/api/responses/${encodeURIComponent(responseId)}/messages`)
        .then(({ messages }) => {
          if (active) setState({ status: "ready", messages });
        })
        .catch((err: unknown) => {
          if (!active) return;
          const permanent = err instanceof ApiRequestError && (err.status === 401 || err.status === 404);
          if (permanent) {
            // Tråden findes ikke (længere), eller sessionen er udløbet. Gentagne kald vil bare give samme fejl.
            stopped = true;
            stopPolling();
            setBlocked(apiErrorMessage(err));
          }
          // En forbigående fejl beholder den sidst viste liste, hvis vi allerede har én, i stedet for at skjule den.
          setState((prev) => (prev.status === "ready" ? prev : { status: "error", message: apiErrorMessage(err) }));
        });
    }

    function handleVisibility() {
      if (document.hidden) {
        stopPolling();
      } else {
        load();
        startPolling();
      }
    }

    load();
    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      stopped = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [responseId]);

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "") {
      setSendError("Skriv en besked.");
      return;
    }
    if (trimmed.length > MESSAGE_MAX_CHARS) {
      setSendError(`Beskeden må højst være ${MESSAGE_MAX_CHARS} tegn.`);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const sent = await apiRequest<MessageDto>(`/api/responses/${encodeURIComponent(responseId)}/messages`, {
        method: "POST",
        body: { body: trimmed },
      });
      setSending(false);
      setBody("");
      setState((prev) => ({
        status: "ready",
        messages: prev.status === "ready" ? [...prev.messages, sent] : [sent],
      }));
    } catch (err) {
      setSending(false);
      setSendError(apiErrorMessage(err));
    }
  }

  return (
    <section aria-label="Beskeder" className="flex flex-col gap-4 border-t border-line pt-6">
      <h3 className="text-base font-semibold text-ink">Beskeder</h3>

      {state.status === "loading" && (
        <p role="status" className="text-sm text-ink-muted">
          Indlæser beskeder …
        </p>
      )}

      {state.status === "error" && !blocked && (
        <Alert tone="danger" role="alert">
          {state.message}
        </Alert>
      )}

      {state.status === "ready" && (
        <ul aria-label="Beskedtråd" className="flex flex-col gap-3">
          {state.messages.length === 0 && (
            <li className="text-sm text-ink-muted">Ingen beskeder endnu. Skriv den første nedenfor.</li>
          )}
          {state.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.fromMe
                  ? "ml-auto max-w-[85%] rounded-lg bg-brand-50 p-3 text-right sm:max-w-[70%]"
                  : "mr-auto max-w-[85%] rounded-lg bg-canvas p-3 sm:max-w-[70%]"
              }
            >
              <p className="text-xs font-semibold text-ink-muted">{message.fromMe ? "Dig" : counterpartLabel}</p>
              <p className="whitespace-pre-line text-base leading-relaxed text-ink">{message.body}</p>
              <p className="mt-1 text-xs text-ink-muted">{formatDateTime(message.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}

      {blocked ? (
        <Alert tone="warning" role="status">
          {blocked}
        </Alert>
      ) : (
        <form
          noValidate
          aria-label="Skriv besked"
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {sendError && (
            <Alert tone="danger" role="alert">
              {sendError}
            </Alert>
          )}
          <label htmlFor={`besked-${responseId}`} className="text-sm font-semibold text-ink">
            Skriv en besked til {counterpartLabel.toLowerCase()}
          </label>
          <textarea
            id={`besked-${responseId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={MESSAGE_MAX_CHARS}
            rows={3}
            className="min-h-24 w-full rounded-lg border border-field-border bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-muted/70"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted" aria-live="polite">
              {body.length}/{MESSAGE_MAX_CHARS} tegn
            </p>
            <Button type="submit" disabled={sending} className="w-full sm:w-auto">
              {sending ? "Sender …" : "Send besked"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
