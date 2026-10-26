"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export type LightboxImage = { id: string; url: string; alt: string; description?: string | null };

type ImageLightboxProps = {
  images: LightboxImage[];
  // Det viste billede; null = lukket.
  openIndex: number | null;
  onChange: (index: number) => void;
  // Kaldes, når dialogen lukkes (Esc, "Luk" eller klik på baggrunden), med det billede, der var åbent.
  onClose: (index: number | null) => void;
};

// Stort billede i en native <dialog> (features/clinics/README.md 6.3; leads 10.12): fokus flyttes ind, Esc og "Luk" lukker, og
// kalderen sender fokus tilbage til miniaturen. Den signerede URL kan også åbnes i en ny fane. Bruges af lead-kortets billeder
// og af billederne i beskedtråden.
export function ImageLightbox({ images, openIndex, onChange, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
    if (openIndex === null && dialog.open) dialog.close();
  }, [openIndex]);

  const current = openIndex !== null ? images[openIndex] : undefined;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onClose(openIndex)}
      onClick={(event) => {
        // Klik på baggrunden (selve dialog-elementet uden for indholdet) lukker.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      aria-label={current ? current.alt : "Billede"}
      className="m-auto max-h-[95dvh] w-[min(64rem,95vw)] rounded-card bg-surface p-0 text-ink shadow-raised backdrop:bg-black/70"
      data-testid="billede-lightbox"
    >
      {current && openIndex !== null && (
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Signeret URL fra storage. */}
          <img src={current.url} alt={current.alt} className="max-h-[75dvh] w-full rounded-control object-contain" />
          {current.description && <p className="text-sm text-ink-muted">{current.description}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">
              Åbn i ny fane
            </a>
            <div className="flex gap-2">
              {images.length > 1 && (
                <>
                  <Button variant="secondary" onClick={() => onChange((openIndex + images.length - 1) % images.length)}>
                    Forrige
                  </Button>
                  <Button variant="secondary" onClick={() => onChange((openIndex + 1) % images.length)}>
                    Næste
                  </Button>
                </>
              )}
              <Button onClick={() => dialogRef.current?.close()} autoFocus>
                Luk
              </Button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
