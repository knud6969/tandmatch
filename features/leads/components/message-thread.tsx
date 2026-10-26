"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { MESSAGE_MAX_CHARS, MESSAGE_MAX_IMAGES } from "@/lib/common/constants/limits";
import {
  CLINIC_SENDER_LABEL,
  MESSAGE_IMAGES_DELETED_TEXT,
  MESSAGE_POLL_INTERVAL_MS,
  OWN_SENDER_LABEL,
  PATIENT_SENDER_LABEL,
} from "@/lib/leads/constants/messages";
import { THREAD_CLOSED_TEXT } from "@/lib/common/constants/error-texts";
import { canSendMessage, isEmptyMessage, keepImageUrls, type ImageUrlCache } from "@/lib/leads/domain/messages";
import type { MessageDto } from "@/lib/leads/types/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest, ApiRequestError } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { IMAGE_ACCEPT, prepareImage } from "@/platform/ui-utils/prepare-image";
import { formatShortDateTime } from "@/lib/common/domain/format";
import { useAction } from "@/platform/ui-utils/use-action";
import { usePolling } from "@/platform/ui-utils/use-polling";
import { ImageLightbox } from "@/features/leads/components/image-lightbox";

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

// Et valgt billede før afsendelse: filen og en lokal forhåndsvisning (blob-URL, frigives, når billedet fjernes eller sendes).
type Attachment = { key: string; file: File; preview: string };

// Åben lightbox: beskeden og billedet i den.
type Opened = { messageId: string; index: number };

// Beskedtråd pr. lead (architecture 10.12). Genbruges i klinikkens lead-kort og i patientens sag. Hentning markerer modtagne
// beskeder som læst, så komponenten bør kun være monteret, når tråden er synlig. Den henter igen hvert 15. sekund, mens
// siden er synlig, og stopper, når komponenten afmonteres. Beskeder kan have op til 3 billeder: de vælges med
// "Vedhæft billeder", vises som forhåndsvisning før afsendelse og som miniaturer i tråden; et tryk åbner billedet stort.
export function MessageThread({ leadId, viewer, closed, hint, onRead }: MessageThreadProps) {
  const [messages, setMessages] = useState<MessageDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadClosed, setThreadClosed] = useState(closed);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const send = useAction();
  const listRef = useRef<HTMLUListElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const thumbRefs = useRef(new Map<string, HTMLButtonElement>());
  const urlCache = useRef<ImageUrlCache>(new Map());
  const attachmentCounter = useRef(0);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);
  useEffect(() => {
    setThreadClosed(closed);
  }, [closed]);

  // Signerede URL'er skifter ved hver hentning; den første genbruges i op til 4 minutter, så billederne ikke hentes igen.
  const withStableUrls = useCallback((list: MessageDto[]) => {
    const kept = keepImageUrls(urlCache.current, list, Date.now());
    urlCache.current = kept.cache;
    return kept.messages;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<{ messages: MessageDto[] }>(`/api/leads/${leadId}/messages`);
      setMessages(withStableUrls(data.messages));
      setLoadError(null);
      onReadRef.current?.();
    } catch (error) {
      // Første hentning viser fejlen; senere polling prøver bare igen næste gang.
      setMessages((current) => {
        if (current === null) setLoadError(apiErrorMessage(error));
        return current;
      });
    }
  }, [leadId, withStableUrls]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Henter igen med jævne mellemrum, kun mens fanen er synlig (fælles hjælper).
  usePolling(() => void refresh(), MESSAGE_POLL_INTERVAL_MS);

  // Forhåndsvisningerne frigives, når komponenten afmonteres.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => () => attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.preview)), []);

  const count = messages?.length ?? 0;
  useEffect(() => {
    // Kun listen scroller (ikke siden): den nyeste besked vises fra toppen, så afsenderlinjen ikke skjules ved én lang besked.
    // Er der ikke mere at scrolle, stopper listen ved bunden.
    const list = listRef.current;
    const last = list?.lastElementChild;
    if (list && last) list.scrollTop += last.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [count]);

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // samme fil kan vælges igen
    if (picked.length === 0) return;
    const room = MESSAGE_MAX_IMAGES - attachments.length;
    if (picked.length > room) send.fail(`Du kan højst vedhæfte ${MESSAGE_MAX_IMAGES} billeder pr. besked.`);
    else send.clear();
    const added = picked.slice(0, Math.max(0, room)).map((file) => ({ key: `vedhaeftet-${(attachmentCounter.current += 1)}`, file, preview: URL.createObjectURL(file) }));
    setAttachments((current) => [...current, ...added]);
  }

  function removeAttachment(key: string) {
    setAttachments((current) => {
      const removed = current.find((a) => a.key === key);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((a) => a.key !== key);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!canSendMessage(text, attachments.length)) return;
    const ok = await send.run(async () => {
      try {
        let created: MessageDto;
        if (attachments.length > 0) {
          // Nedskaleres og genkodes i browseren (EXIF fjernes igen på serveren).
          const form = new FormData();
          if (text !== "") form.set("body", text);
          for (const attachment of attachments) form.append("file", await prepareImage(attachment.file));
          created = await apiRequest<MessageDto>(`/api/leads/${leadId}/messages`, { method: "POST", form });
        } else {
          created = await apiRequest<MessageDto>(`/api/leads/${leadId}/messages`, { method: "POST", body: { body: text } });
        }
        setMessages((current) => withStableUrls([...(current ?? []).filter((m) => m.id !== created.id), created]));
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "THREAD_CLOSED") setThreadClosed(true);
        throw error;
      }
    });
    if (ok) {
      setBody("");
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setAttachments([]);
    }
  }

  const otherLabel = viewer === "clinic" ? PATIENT_SENDER_LABEL : CLINIC_SENDER_LABEL;
  const openedMessage = opened ? messages?.find((m) => m.id === opened.messageId) : undefined;
  const lightboxImages = (openedMessage?.images ?? []).map((image, index) => ({
    id: image.id,
    url: image.url,
    alt: `Billede ${index + 1} fra ${openedMessage?.fromMe ? "dig" : otherLabel.toLowerCase()}`,
  }));

  function closeLightbox(index: number | null) {
    const image = index !== null ? openedMessage?.images[index] : undefined;
    setOpened(null);
    if (image) thumbRefs.current.get(image.id)?.focus();
  }

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
        <p role="status" className="text-sm text-ink-muted">
          Henter beskeder …
        </p>
      )}
      {messages !== null && messages.length === 0 && <p className="text-sm text-ink-muted">Ingen beskeder endnu.</p>}
      {messages !== null && messages.length > 0 && (
        <ul ref={listRef} aria-label="Beskeder" className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {messages.map((message) => (
            <li key={message.id} className={cx("flex flex-col gap-1", message.fromMe ? "items-end" : "items-start")} data-testid="besked">
              <p className="text-xs font-semibold text-ink-muted">
                {message.fromMe ? OWN_SENDER_LABEL : otherLabel} · <span className="font-normal">{formatShortDateTime(message.createdAt)}</span>
              </p>
              {message.images.length > 0 && (
                <ul className={cx("flex max-w-[90%] flex-wrap gap-1.5", message.fromMe && "justify-end")} aria-label="Billeder i beskeden">
                  {message.images.map((image, index) => (
                    <li key={image.id}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) thumbRefs.current.set(image.id, el);
                          else thumbRefs.current.delete(image.id);
                        }}
                        onClick={() => setOpened({ messageId: message.id, index })}
                        className="block overflow-hidden rounded-control border border-line bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        aria-label={`Forstør billede ${index + 1} fra ${message.fromMe ? "dig" : otherLabel.toLowerCase()}`}
                        data-testid="besked-billede"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Signeret URL fra storage; ingen next/image-optimering i prototypen. */}
                        <img src={image.url} alt="" className="size-20 object-cover sm:size-24" loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {message.body !== "" && (
                <p
                  className={cx(
                    "max-w-[90%] whitespace-pre-line break-words rounded-card px-3 py-2 text-sm leading-relaxed",
                    message.fromMe ? "bg-brand-600 text-on-brand" : "bg-surface-muted text-ink",
                  )}
                >
                  {message.body}
                </p>
              )}
              {isEmptyMessage(message) && <p className="rounded-card px-3 py-2 text-sm italic text-ink-muted ring-1 ring-inset ring-line">{MESSAGE_IMAGES_DELETED_TEXT}</p>}
            </li>
          ))}
        </ul>
      )}

      <ImageLightbox
        images={lightboxImages}
        openIndex={opened && openedMessage ? opened.index : null}
        onChange={(index) => setOpened((current) => (current ? { ...current, index } : current))}
        onClose={closeLightbox}
      />

      {threadClosed ? (
        <p className="text-sm text-ink-muted" data-testid="traad-lukket">
          {THREAD_CLOSED_TEXT}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <TextArea
            label="Skriv en besked"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MESSAGE_MAX_CHARS}
            rows={2}
            className="min-h-16"
            hint={hint}
          />
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Billeder, der sendes med" data-testid="vedhaeftede-billeder">
              {attachments.map((attachment, index) => (
                <li key={attachment.key} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Lokal forhåndsvisning (blob-URL). */}
                  <img src={attachment.preview} alt={`Valgt billede ${index + 1}`} className="size-20 rounded-control border border-line object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.key)}
                    className="absolute -right-2 -top-2 flex size-11 items-center justify-center"
                    aria-label={`Fjern billede ${index + 1}`}
                  >
                    <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-ink text-sm font-semibold text-surface shadow-sm">
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <StatusMessage message={send.message} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={onFiles}
              className="sr-only"
              aria-label="Vælg billeder til beskeden"
              tabIndex={-1}
              data-testid="vedhaeft-input"
            />
            <Button
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={send.busy || attachments.length >= MESSAGE_MAX_IMAGES}
              className="w-full sm:w-fit"
            >
              Vedhæft billeder ({attachments.length}/{MESSAGE_MAX_IMAGES})
            </Button>
            <Button type="submit" disabled={send.busy || !canSendMessage(body, attachments.length)} className="w-full sm:w-fit">
              {send.busy ? "Sender …" : "Send besked"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
