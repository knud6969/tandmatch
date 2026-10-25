"use client";

import { useEffect, useRef, useState } from "react";
import type { ClinicLeadDetailDto } from "@/lib/leads/types/leads";
import { Button } from "@/components/ui/button";

type LeadImage = ClinicLeadDetailDto["images"][number];

const altText = (image: LeadImage, index: number) => image.approvedDescription ?? `Billede ${index + 1} fra patienten`;

// Patientens billeder på lead-kortet (features/clinics/README.md 6.3): én vandret række af miniaturer. Et tryk åbner billedet
// stort i en native <dialog> (fokus flyttes ind, Esc og "Luk" lukker, fokus vender tilbage til miniaturen). Den signerede URL
// kan også åbnes i en ny fane.
export function LeadImages({ images }: { images: LeadImage[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
    if (openIndex === null && dialog.open) dialog.close();
  }, [openIndex]);

  function onClose() {
    const index = openIndex;
    setOpenIndex(null);
    if (index !== null) triggerRefs.current[index]?.focus();
  }

  const current = openIndex !== null ? images[openIndex] : null;

  return (
    <section aria-labelledby="billeder" className="flex flex-col gap-2">
      <h2 id="billeder" className="text-base font-semibold text-ink">
        Billeder ({images.length})
      </h2>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Billeder fra patienten">
        {images.map((image, index) => (
          <li key={image.id} className="shrink-0">
            <button
              type="button"
              ref={(el) => {
                triggerRefs.current[index] = el;
              }}
              onClick={() => setOpenIndex(index)}
              className="block overflow-hidden rounded-control border border-line bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              aria-label={`Forstør: ${altText(image, index)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Signeret URL fra storage; ingen next/image-optimering i prototypen. */}
              <img src={image.url} alt="" className="size-24 object-cover sm:size-28" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={(event) => {
          // Klik på baggrunden (selve dialog-elementet uden for indholdet) lukker.
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        aria-label={current ? altText(current, openIndex ?? 0) : "Billede"}
        className="m-auto max-h-[95dvh] w-[min(64rem,95vw)] rounded-card bg-surface p-0 text-ink shadow-raised backdrop:bg-black/70"
      >
        {current && openIndex !== null && (
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- Signeret URL fra storage. */}
            <img src={current.url} alt={altText(current, openIndex)} className="max-h-[75dvh] w-full rounded-control object-contain" />
            {current.approvedDescription && <p className="text-sm text-ink-muted">{current.approvedDescription}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">
                Åbn i ny fane
              </a>
              <div className="flex gap-2">
                {images.length > 1 && (
                  <>
                    <Button variant="secondary" onClick={() => setOpenIndex((openIndex + images.length - 1) % images.length)}>
                      Forrige
                    </Button>
                    <Button variant="secondary" onClick={() => setOpenIndex((openIndex + 1) % images.length)}>
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
    </section>
  );
}
