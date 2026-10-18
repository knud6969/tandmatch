"use client";

import type { ModerationStatus, OwnReviewDto } from "@/lib/types/reviews";
import { ReviewDetails, ReviewReply } from "@/views/components/clinic-directory/public-review-list";
import { Badge, type BadgeTone } from "@/views/components/ui/badge";
import { LoadState } from "@/views/components/ui/load-state";
import { apiRequest } from "@/views/utils/api-client";
import { MODERATION_LABEL, MODERATION_TONE } from "@/views/utils/review-status";
import { useLoad } from "@/views/utils/use-load";

const loadOwn = async (): Promise<OwnReviewDto[]> => (await apiRequest<{ reviews: OwnReviewDto[] }>("/api/reviews/mine")).reviews;

function OwnReview({ review }: { review: OwnReviewDto }) {
  const status: ModerationStatus = review.moderationStatus;
  const tone: BadgeTone = MODERATION_TONE[status];
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line p-4" data-testid="min-anmeldelse" data-status={status}>
      <p className="text-base font-semibold text-ink">{review.clinic.name}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{MODERATION_LABEL[status]}</Badge>
      </div>
      {status === "rejected" && (
        <p className="break-words text-base text-ink" data-testid="afvist-begrundelse">
          Begrundelse: {review.rejectionReason ?? "Ingen begrundelse angivet."}
        </p>
      )}
      <ReviewDetails review={review} />
      {review.reply && <ReviewReply text={review.reply.text} />}
    </li>
  );
}

// Patientens egne anmeldelser med moderationsstatus (architecture 6.2, 8.5). Klinikkens svar vises kun, når det er godkendt.
export function OwnReviews() {
  const { data, loading, error, reload } = useLoad(loadOwn);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.length === 0) return <p className="text-base text-ink-muted">Du har ikke skrevet nogen anmeldelser endnu.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {data.map((review) => (
        <OwnReview key={review.id} review={review} />
      ))}
    </ul>
  );
}
