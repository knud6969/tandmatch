"use client";

import { useCallback, type ReactNode } from "react";
import { MIN_REVIEWS_FOR_PRICE_ACCURACY, PRICE_ACCURACY_LABEL } from "@/lib/constants/reviews";
import type { PublicReviewDto, PublicReviewsDto } from "@/lib/types/reviews";
import { Badge } from "@/views/components/ui/badge";
import { LoadState } from "@/views/components/ui/load-state";
import { StarRating, Stars } from "@/views/components/clinic-directory/star-rating";
import { apiRequest } from "@/views/utils/api-client";
import { formatKr, formatMonth, formatPercent } from "@/views/utils/format";
import { useLoad } from "@/views/utils/use-load";

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

function ReviewItem({ review }: { review: PublicReviewDto }) {
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line p-4" data-testid="offentlig-anmeldelse">
      <ReviewDetails review={review} />
      {review.reply && <ReviewReply text={review.reply.text} />}
    </li>
  );
}

// Platformens egne anmeldelser (kun fra gennemførte besøg) med prisnøjagtighed. Trustpilot vises adskilt andetsteds.
export function PublicReviewList({ clinicId }: { clinicId: string }) {
  const loader = useCallback(() => apiRequest<PublicReviewsDto>(`/api/clinics/${clinicId}/reviews`), [clinicId]);
  const { data, loading, error, reload } = useLoad(loader);

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const { stats, reviews } = data;

  if (stats.reviewCount === 0) {
    return <p className="text-base text-ink-muted">Der er endnu ingen verificerede anmeldelser på TandMatch.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-card bg-surface-muted p-4 sm:flex-row sm:items-center sm:gap-8">
        {stats.avgStars !== null && (
          <div>
            <StarRating value={stats.avgStars} count={stats.reviewCount} size="lg" />
            <p className="text-sm text-ink-muted">Gennemsnit af verificerede anmeldelser</p>
          </div>
        )}
        <div>
          {stats.priceAccuracyPct !== null ? (
            <>
              <p className="text-lg font-semibold text-ink">Prisnøjagtighed {formatPercent(stats.priceAccuracyPct)}</p>
              <p className="text-sm text-ink-muted">
                Andel af anmeldelserne, hvor den endelige pris svarede til prisoverslaget
                {stats.distribution &&
                  ` (${stats.distribution.asQuoted} som oplyst, ${stats.distribution.slightlyHigher} lidt højere, ${stats.distribution.muchHigher} langt højere)`}
                .
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              Prisnøjagtighed vises, når klinikken har mindst {MIN_REVIEWS_FOR_PRICE_ACCURACY} verificerede anmeldelser.
            </p>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        Kun patienter, der har gennemført et besøg via TandMatch, kan anmelde. Anmeldelserne modereres, og klinikken kan svare offentligt.
      </p>
    </div>
  );
}
