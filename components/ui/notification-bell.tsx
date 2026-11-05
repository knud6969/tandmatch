"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { LoadState } from "@/components/ui/load-state";
import {
  INBOX_BELL_LABEL,
  INBOX_EMPTY_TEXT,
  INBOX_HEADING,
  INBOX_MARK_ALL_READ,
  INBOX_POLL_MS,
  INBOX_UNREAD_LABEL,
} from "@/lib/common/constants/notifications";
import { formatNotificationAge, formatUnreadBadge } from "@/lib/common/domain/notifications";
import type { NotificationInboxDto, NotificationItemDto } from "@/lib/common/types/notifications";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { useLoad } from "@/platform/ui-utils/use-load";

// Stabil funktion uden for komponenten (useLoad henter igen, når den skifter).
const loadInbox = () => apiRequest<NotificationInboxDto>("/api/notifications");

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

// Klokken i klinikkens header (platform 14.11): tal for ulæste, liste med de nyeste, tryk åbner leadet eller kalenderen og
// markerer som læst, og "Marker alle som læst". Tallet hentes igen hvert 30. sekund, kun mens fanen er synlig. Virker uanset
// klinikkens e-mail- og push-valg.
export function NotificationBell() {
  const { data, error, loading, reload } = useLoad(loadInbox, { pollMs: INBOX_POLL_MS });
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Luk med Escape og ved tryk udenfor.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const unread = data?.unreadCount ?? 0;
  const label = unread > 0 ? `${INBOX_BELL_LABEL}, ${formatUnreadBadge(unread)} ${INBOX_UNREAD_LABEL}` : INBOX_BELL_LABEL;

  async function markRead(ids?: string[]) {
    setActionError(null);
    try {
      await apiRequest<void>("/api/notifications/read", { method: "POST", body: ids ? { ids } : {} });
    } catch (e) {
      setActionError(apiErrorMessage(e));
    }
    reload();
  }

  function openItem(item: NotificationItemDto) {
    setOpen(false);
    if (item.readAt === null) void markRead([item.id]);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) reload();
        }}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-ink hover:bg-surface-muted"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-brand-700 px-1 text-xs font-bold leading-5 text-on-brand"
          >
            {formatUnreadBadge(unread)}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={INBOX_HEADING}
          className="fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-y-auto rounded-card border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-base font-semibold text-ink">{INBOX_HEADING}</h2>
            {unread > 0 && (
              <Button variant="ghost" className="min-h-11 px-2 text-sm" onClick={() => void markRead()}>
                {INBOX_MARK_ALL_READ}
              </Button>
            )}
          </div>
          {actionError && (
            <p role="alert" className="border-b border-line px-4 py-2 text-sm text-danger-ink">
              {actionError}
            </p>
          )}
          <div className="px-2 py-2">
            {!data ? (
              <div className="px-2 py-2">
                <LoadState loading={loading} error={error} onRetry={reload} />
              </div>
            ) : data.items.length === 0 ? (
              <p className="px-2 py-3 text-base text-ink-muted">{INBOX_EMPTY_TEXT}</p>
            ) : (
              <ul className="flex flex-col">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.path}
                      onClick={() => openItem(item)}
                      className={cx(
                        "flex min-h-11 items-start gap-3 rounded-control px-2 py-2 no-underline hover:bg-surface-muted",
                        item.readAt === null ? "text-ink" : "text-ink-muted",
                      )}
                    >
                      <span aria-hidden="true" className={cx("mt-2 size-2.5 shrink-0 rounded-full", item.readAt === null ? "bg-brand-700" : "bg-transparent")} />
                      <span className="flex min-w-0 flex-col">
                        <span className={cx("text-base", item.readAt === null && "font-semibold")}>
                          {item.readAt === null && <span className="sr-only">Ulæst: </span>}
                          {item.title}
                        </span>
                        {item.body && <span className="text-sm text-ink-muted">{item.body}</span>}
                        <span className="text-sm text-ink-muted">{formatNotificationAge(item.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
