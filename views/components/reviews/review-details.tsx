import type { ReactNode } from "react";
import { PRICE_ACCURACY_LABEL } from "@/lib/constants/reviews";
import type { PublicReviewDto } from "@/lib/types/reviews";
import { Stars } from "@/features/clinics/components/star-rating";
import { Badge } from "@/components/ui/badge";
import { formatKr, formatMonth } from "@/platform/ui-utils/format";

// Indholdet i en anmeldelse (stjerner, tekst, prisnøjagtighed og gennemsigtighed). Genbruges af patientens og klinikkens visning.
export function ReviewDetails({ review, badge }: { review: PublicReviewDto; badge?: ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Stars stars={review.stars} />
        <Badge tone="brand">Verificeret besøg</Badge>
        {badge}
        <span className="text-sm text-ink-muted">{formatMonth(review.createdMonth)}</span>
      </div>
      <p className="whitespace-pre-line break-words text-base leading-relaxed text-ink">{review.text}</p>
      <p className="text-sm text-ink-muted">
        <span className="font-semibold text-ink">Svarede prisen til prisoverslaget?</span> {PRICE_ACCURACY_LABEL[review.priceAccuracy]}
        {review.actualPrice !== null && <> · Faktisk pris: {formatKr(review.actualPrice)}</>}
      </p>
      {review.lackedTransparency && (
        <p className="break-words text-sm text-ink-muted">
          <span className="font-semibold text-ink">Manglede gennemsigtighed om prisen.</span>
          {review.transparencyComment && ` ${review.transparencyComment}`}
        </p>
      )}
    </>
  );
}

// Klinikkens offentlige svar under en anmeldelse.
export function ReviewReply({ text }: { text: string }) {
  return (
    <div className="rounded-control bg-surface-muted p-3" data-testid="klinik-svar">
      <p className="text-sm font-semibold text-ink">Svar fra klinikken</p>
      <p className="whitespace-pre-line break-words text-base text-ink">{text}</p>
    </div>
  );
}
