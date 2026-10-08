"use client";

import { useEffect, useState } from "react";
import { StarRating } from "@/views/components/standard/star-rating";
import { Alert } from "@/views/components/ui/alert";
import { Badge, type BadgeTone } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { TextArea } from "@/views/components/ui/text-area";
import { ApiRequestError, apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { priceAccuracyLabel } from "@/lib/constants/standard";
import { formatKr, formatMonth } from "@/views/utils/format";
import { createReplySchema } from "@/lib/schemas/standard";
import type { DentistOwnReviewDto, ModerationStatus } from "@/lib/types/standard";

type State =
  | { status: "loading" }
  | { status: "ready"; reviews: DentistOwnReviewDto[] }
  | { status: "notVerified" }
  | { status: "error"; message: string };

const MODERATION_LABEL: Record<ModerationStatus, string> = {
  pending: "Afventer moderation",
  approved: "Godkendt",
  rejected: "Ikke godkendt",
};

const MODERATION_TONE: Record<ModerationStatus, BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "neutral",
};

// Tandlægens egne anmeldelser (architecture 6.3, 10.9). Afventende anmeldelser og svar vises, så tandlægen ikke svarer igen.
export function DentistReviews() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<{ reviews: DentistOwnReviewDto[] }>("/api/dentists/me/reviews")
      .then(({ reviews }) => {
        if (active) setState({ status: "ready", reviews });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiRequestError && err.code === "NOT_VERIFIED") {
          setState({ status: "notVerified" });
          return;
        }
        setState({ status: "error", message: apiErrorMessage(err) });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser anmeldelser …
      </p>
    );
  }

  if (state.status === "notVerified") {
    return (
      <Alert tone="warning" title="Afventer verifikation">
        <p>Du kan se og svare på anmeldelser, når din profil er verificeret.</p>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Anmeldelserne kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const { reviews } = state;

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="Svar modereres">
        <p>
          Dit svar offentliggøres først, når det er gennemgået af moderation. Svar kun sagligt og uden
          personoplysninger. Du kan kun svare én gang pr. anmeldelse.
        </p>
      </Alert>

      {reviews.length === 0 ? (
        <Card>
          <p className="text-base text-ink-muted">Du har ingen anmeldelser endnu.</p>
        </Card>
      ) : (
        <ul aria-label="Anmeldelser" className="flex flex-col gap-5">
          {reviews.map((review) => (
            <li key={review.reviewId}>
              <ReviewReplyCard review={review} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewReplyCard({ review }: { review: DentistOwnReviewDto }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<DentistOwnReviewDto["reply"]>(null);

  // Svar kan kun gives, når anmeldelsen er godkendt, og der ikke allerede er et svar (API-regel).
  const reply = sent ?? review.reply;
  const canReply = review.moderationStatus === "approved" && reply === null;

  async function submit() {
    setServerError(null);
    const parsed = createReplySchema.safeParse({ text });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Skriv et svar.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const created = await apiRequest<{ id: string; moderationStatus: ModerationStatus }>(
        `/api/reviews/${review.reviewId}/reply`,
        { method: "POST", body: parsed.data },
      );
      setPending(false);
      setSent({ id: created.id, text: parsed.data.text, replyStatus: created.moderationStatus });
    } catch (err) {
      setPending(false);
      setServerError(apiErrorMessage(err));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StarRating stars={review.stars} />
        <Badge tone={MODERATION_TONE[review.moderationStatus]}>
          Anmeldelse: {MODERATION_LABEL[review.moderationStatus]}
        </Badge>
      </div>
      <p className="text-sm text-ink-muted">Anmeldt {formatMonth(review.createdAt.slice(0, 7))}</p>
      <p className="whitespace-pre-line text-base leading-relaxed text-ink">{review.text}</p>
      <p className="text-sm text-ink-muted">
        {priceAccuracyLabel(review.priceAccuracy)}
        {review.actualPrice !== null && `. Faktisk pris: ${formatKr(review.actualPrice)}`}
        {review.lackedTransparency && review.transparencyComment && `. Gennemsigtighed: ${review.transparencyComment}`}
      </p>

      {reply ? (
        <div className="rounded-lg border-l-4 border-brand-600 bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Dit svar</p>
            <Badge tone={MODERATION_TONE[reply.replyStatus]}>Svar: {MODERATION_LABEL[reply.replyStatus]}</Badge>
          </div>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink">{reply.text}</p>
          {reply.replyStatus === "pending" && (
            <p className="mt-2 text-sm text-ink-muted">Svaret vises offentligt, når det er godkendt.</p>
          )}
          {reply.replyStatus === "rejected" && (
            <p className="mt-2 text-sm text-ink-muted">Svaret er ikke godkendt og vises ikke offentligt.</p>
          )}
        </div>
      ) : canReply ? (
        <form
          noValidate
          aria-label="Svar på anmeldelse"
          className="flex flex-col gap-4 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {serverError && (
            <Alert tone="danger" role="alert">
              {serverError}
            </Alert>
          )}
          <TextArea
            label="Dit svar"
            hint="Svaret offentliggøres efter moderation. Højst 1000 tegn."
            value={text}
            onChange={(event) => setText(event.target.value)}
            error={error}
            rows={3}
          />
          <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-start">
            {pending ? "Sender …" : "Send svar"}
          </Button>
        </form>
      ) : review.moderationStatus !== "approved" ? (
        <p className="border-t border-line pt-4 text-sm text-ink-muted">
          Du kan svare, når anmeldelsen er godkendt af moderation.
        </p>
      ) : null}
    </Card>
  );
}
