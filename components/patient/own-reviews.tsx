"use client";

import { useEffect, useState } from "react";
import { StarRating } from "@/components/standard/star-rating";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { priceAccuracyLabel } from "@/lib/constants/standard-labels";
import { formatDate } from "@/lib/format/danish";
import type { ModerationStatus, OwnReviewDto } from "@/lib/types/standard";

const STATUS_LABEL: Record<ModerationStatus, string> = {
  pending: "Afventer moderation",
  approved: "Offentliggjort",
  rejected: "Ikke godkendt",
};

const STATUS_TONE: Record<ModerationStatus, BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "neutral",
};

// Patientens egne anmeldelser og deres moderationsstatus (architecture 10.9). Kun ejerens egne data.
export function OwnReviews() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; reviews: OwnReviewDto[] } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<{ reviews: OwnReviewDto[] }>("/api/reviews/mine")
      .then(({ reviews }) => {
        if (active) setState({ status: "ready", reviews });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser dine anmeldelser …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Dine anmeldelser kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  if (state.reviews.length === 0) {
    return (
      <p className="text-base text-ink-muted">Du har ikke anmeldt nogen besøg endnu.</p>
    );
  }

  return (
    <ul aria-label="Mine anmeldelser" className="flex flex-col gap-4">
      {state.reviews.map((review) => (
        <li key={review.id}>
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StarRating stars={review.stars} />
              <Badge tone={STATUS_TONE[review.moderationStatus]}>{STATUS_LABEL[review.moderationStatus]}</Badge>
            </div>
            <p className="text-sm text-ink-muted">Sendt {formatDate(review.createdAt)}</p>
            <p className="whitespace-pre-line text-base leading-relaxed text-ink">{review.text}</p>
            <p className="text-sm text-ink-muted">{priceAccuracyLabel(review.priceAccuracy)}</p>
            {review.moderationStatus === "pending" && (
              <p className="text-sm text-ink-muted">Anmeldelsen vises offentligt, når den er godkendt.</p>
            )}
            {review.moderationStatus === "rejected" && (
              <Alert tone="info" title="Anmeldelsen blev ikke godkendt">
                <p>{review.rejectionReason ? `Begrundelse: ${review.rejectionReason}` : "Anmeldelsen vises ikke offentligt."}</p>
              </Alert>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
