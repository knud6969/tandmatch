"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { MESSAGE_MAX_CHARS } from "@/lib/constants/limits";
import { formatDateTime } from "@/lib/format/danish";
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
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    function load() {
      apiRequest<{ messages: MessageDto[] }>(`/api/responses/${encodeURIComponent(responseId)}/messages`)
        .then(({ messages }) => {
          if (active) setState({ status: "ready", messages });
        })
        .catch((err: unknown) => {
          if (active) setState({ status: "error", message: apiErrorMessage(err) });
        });
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
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

      {state.status === "error" && (
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
    </section>
  );
}
