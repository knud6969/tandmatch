import { StarRating } from "@/components/standard/star-rating";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatKr, formatMonth } from "@/lib/format/danish";
import { priceAccuracyLabel } from "@/lib/constants/standard-labels";
import type { PublicReviewDto } from "@/lib/types/standard";

// Verificerede anmeldelser fra platformen. Hver anmeldelse er markeret som verificeret besøg. Svar vises kun når godkendt.
export function PublicReviewList({ reviews }: { reviews: PublicReviewDto[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-base leading-relaxed text-ink-muted">
        Der er ingen godkendte anmeldelser endnu. Anmeldelser vises her, når de er gennemgået af moderation.
      </p>
    );
  }

  return (
    <ul aria-label="Verificerede anmeldelser" className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li key={review.id}>
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StarRating stars={review.stars} />
              <Badge tone="brand">Verificeret besøg</Badge>
            </div>
            <p className="text-sm text-ink-muted">Anmeldt {formatMonth(review.createdMonth)}</p>
            <p className="whitespace-pre-line text-base leading-relaxed text-ink">{review.text}</p>

            <dl className="grid gap-3 text-base sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-ink-muted">Endelig pris i forhold til prisoverslag</dt>
                <dd className="text-ink">
                  {priceAccuracyLabel(review.priceAccuracy)}
                  {review.actualPrice !== null && `. Faktisk pris: ${formatKr(review.actualPrice)}`}
                </dd>
              </div>
              {review.lackedTransparency && (
                <div>
                  <dt className="text-sm font-semibold text-ink-muted">Gennemsigtighed</dt>
                  <dd className="whitespace-pre-line text-ink">
                    Der manglede gennemsigtighed i prisen.
                    {review.transparencyComment ? `\n${review.transparencyComment}` : ""}
                  </dd>
                </div>
              )}
            </dl>

            {review.reply && (
              <div className="rounded-lg border-l-4 border-brand-600 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-ink">Svar fra tandlægen</p>
                <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-ink">{review.reply.text}</p>
                <p className="mt-2 text-sm text-ink-muted">Svar fra {formatDateTime(review.reply.createdAt)}</p>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
