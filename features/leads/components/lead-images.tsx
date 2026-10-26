"use client";

import { useRef, useState } from "react";
import type { ClinicLeadDetailDto } from "@/lib/leads/types/leads";
import { ImageLightbox } from "@/features/leads/components/image-lightbox";

type LeadImage = ClinicLeadDetailDto["images"][number];

const altText = (image: LeadImage, index: number) => image.approvedDescription ?? `Billede ${index + 1} fra patienten`;

// Patientens billeder på lead-kortet (features/clinics/README.md 6.3): én vandret række af miniaturer. Et tryk åbner billedet
// stort i lightboxen (image-lightbox.tsx); fokus vender tilbage til miniaturen, når den lukkes.
export function LeadImages({ images }: { images: LeadImage[] }) {
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function onClose(index: number | null) {
    setOpenIndex(null);
    if (index !== null) triggerRefs.current[index]?.focus();
  }

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

      <ImageLightbox
        images={images.map((image, index) => ({ id: image.id, url: image.url, alt: altText(image, index), description: image.approvedDescription }))}
        openIndex={openIndex}
        onChange={setOpenIndex}
        onClose={onClose}
      />
    </section>
  );
}
