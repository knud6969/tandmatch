"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MESSAGE_MAX_CHARS } from "@/lib/common/constants/limits";
import {
  CLINIC_SENDER_LABEL,
  MESSAGE_POLL_INTERVAL_MS,
  OWN_SENDER_LABEL,
  PATIENT_SENDER_LABEL,
} from "@/lib/leads/constants/messages";
import { THREAD_CLOSED_TEXT } from "@/lib/common/constants/error-texts";
import type { MessageDto } from "@/lib/leads/types/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest, ApiRequestError } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { useAction } from "@/platform/ui-utils/use-action";
import { usePolling } from "@/platform/ui-utils/use-polling";

type MessageThreadProps = {
  leadId: string;
  // Hvem der læser: bestemmer navnet over modpartens beskeder.
  viewer: "clinic" | "patient";
  // Lukket tråd (afvist eller trukket tilbage): beskederne vises, men der kan ikke skrives.
  closed: boolean;
  // Tekst under inputfeltet, fx hvad modparten kan se.
  hint?: ReactNode;
  // Kaldes, når beskederne er hentet og dermed markeret læst.
  onRead?: () => void;
};

// Beskedtråd pr. lead (architecture 10.12). Genbruges i klinikkens lead-kort og i patientens sag. Hentning markerer modtagne
// beskeder som læst, så komponenten bør kun være monteret, når tråden er synlig. Den henter igen hvert 15. sekund, mens
// siden er synlig, og stopper, når komponenten afmonteres.
export function MessageThread({ leadId, viewer, closed, hint, onRead }: MessageThreadProps) {
  const [messages, setMessages] = useState<MessageDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadClosed, setThreadClosed] = useState(closed);
  const [body, setBody] = useState("");
  const send = useAction();
  const listRef = useRef<HTMLUListElement>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);
  useEffect(() => {
    setThreadClosed(closed);
  }, [closed]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<{ messages: MessageDto[] }>(`/api/leads/${leadId}/messages`);
      setMessages(data.messages);
      setLoadError(null);
      onReadRef.current?.();
    } catch (error) {
      // Første hentning viser fejlen; senere polling prøver bare igen næste gang.
      setMessages((current) => {
        if (current === null) setLoadError(apiErrorMessage(error));
        return current;
      });
    }
  }, [leadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Henter igen med jævne mellemrum, kun mens fanen er synlig (fælles hjælper).
  usePolling(() => void refresh(), MESSAGE_POLL_INTERVAL_MS);

  const count = messages?.length ?? 0;
  useEffect(() => {
    // Kun listen scroller (ikke siden): den nyeste besked vises fra toppen, så afsenderlinjen ikke skjules ved én lang besked.
    // Er der ikke mere at scrolle, stopper listen ved bunden.
    const list = listRef.current;
    const last = list?.lastElementChild;
    if (list && last) list.scrollTop += last.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [count]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (text === "") return;
    const ok = await send.run(async () => {
      try {
        const created = await apiRequest<MessageDto>(`/api/leads/${leadId}/messages`, { method: "POST", body: { body: text } });
        setMessages((current) => [...(current ?? []).filter((m) => m.id !== created.id), created]);
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "THREAD_CLOSED") setThreadClosed(true);
        throw error;
      }
    });
    if (ok) setBody("");
  }

  const otherLabel = viewer === "clinic" ? PATIENT_SENDER_LABEL : CLINIC_SENDER_LABEL;

  return (
    <div className="flex flex-col gap-3" data-testid="beskedtraad">
      {loadError && (
        <Alert tone="danger" role="alert">
          <p>{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void refresh()}>
            Prøv igen
          </Button>
        </Alert>
      )}
      {messages === null && !loadError && (
        <p role="status" className="text-base text-ink-muted">
          Henter beskeder …
        </p>
      )}
      {messages !== null && messages.length === 0 && <p className="text-base text-ink-muted">Der er ingen beskeder endnu.</p>}
      {messages !== null && messages.length > 0 && (
        <ul ref={listRef} aria-label="Beskeder" className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
          {messages.map((message) => (
            <li key={message.id} className={cx("flex flex-col gap-1", message.fromMe ? "items-end" : "items-start")} data-testid="besked">
              <p className="text-sm font-semibold text-ink-muted">
                {message.fromMe ? OWN_SENDER_LABEL : otherLabel} · <span className="font-normal">{formatShortDateTime(message.createdAt)}</span>
              </p>
              <p
                className={cx(
                  "max-w-[90%] whitespace-pre-line break-words rounded-card px-4 py-2.5 text-base leading-relaxed",
                  message.fromMe ? "bg-brand-600 text-on-brand" : "bg-surface-muted text-ink",
                )}
              >
                {message.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {threadClosed ? (
        <p className="text-base text-ink-muted" data-testid="traad-lukket">
          {THREAD_CLOSED_TEXT}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <TextArea
            label="Skriv en besked"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_MAX_CHARS}
            rows={3}
            className="min-h-24"
            hint={hint}
          />
          <StatusMessage message={send.message} />
          <Button type="submit" disabled={send.busy || body.trim() === ""} className="w-full sm:w-fit">
            {send.busy ? "Sender …" : "Send besked"}
          </Button>
        </form>
      )}
    </div>
  );
}
