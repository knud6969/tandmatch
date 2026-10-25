"use client";

import { useCallback } from "react";
import { MIN_REVIEWS_FOR_PRICE_ACCURACY } from "@/lib/booking/constants/reviews";
import type { PublicReviewDto, PublicReviewsDto } from "@/lib/booking/types/reviews";
import { LoadState } from "@/components/ui/load-state";
import { ReviewDetails, ReviewReply } from "@/features/booking/ui";
import { StarRating } from "@/features/clinics/components/star-rating";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { formatPercent } from "@/lib/common/domain/format";
import { useLoad } from "@/platform/ui-utils/use-load";

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
