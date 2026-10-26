"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const SCROLL_SLACK_PX = 24;

// Vilkår og privatlivspolitik i en native <dialog> (identity 2.5). Accept-knappen virker først, når teksten er rullet
// til bunden, så brugeren har set hele teksten. Teksten (children) er de samme afsnit som på /vilkaar og /privatliv.
// Esc, "Luk" og klik på baggrunden lukker uden accept.
export function TermsDialog({
  open,
  onClose,
  onAccept,
  acceptLabel,
  pending = false,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  acceptLabel: string;
  pending?: boolean;
  error?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const titleId = useId();
  const hintId = useId();

  const checkScroll = useCallback(() => {
    const el = bodyRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_SLACK_PX) setReadToEnd(true);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Fokus på selve dialogen (ikke tekstfeltet), så Safari ikke viser en fokusramme om teksten ved åbning.
      dialog.focus();
      bodyRef.current?.scrollTo({ top: 0 });
      // Er teksten kortere end vinduet (stor skærm), er den allerede læst til bunden.
      requestAnimationFrame(checkScroll);
    }
    if (!open && dialog.open) dialog.close();
  }, [open, checkScroll]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current && !pending) dialogRef.current?.close();
      }}
      className="m-auto h-[100dvh] outline-none max-h-[100dvh] w-full max-w-full flex-col bg-surface p-0 text-ink shadow-raised backdrop:bg-black/60 open:flex sm:h-[min(48rem,90dvh)] sm:max-h-[90dvh] sm:w-[min(44rem,92vw)] sm:rounded-card"
    >
      <header className="border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-xl font-semibold tracking-tight text-ink">
          Brugervilkår og privatlivspolitik
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Læs teksten igennem. Du kan acceptere, når du har rullet til bunden.</p>
      </header>
      <div
        ref={bodyRef}
        onScroll={checkScroll}
        tabIndex={0}
        data-testid="vilkaar-tekst"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5 focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
      >
        {children}
      </div>
      <footer className="flex flex-col gap-3 border-t border-line px-5 py-4">
        {error}
        {!readToEnd && (
          <p id={hintId} className="text-sm text-ink-muted">
            Rul ned til bunden for at kunne acceptere.
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>
            Luk
          </Button>
          <Button onClick={onAccept} disabled={!readToEnd || pending} aria-describedby={readToEnd ? undefined : hintId}>
            {acceptLabel}
          </Button>
        </div>
      </footer>
    </dialog>
  );
}

