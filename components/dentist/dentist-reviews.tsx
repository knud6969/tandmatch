"use client";

import { useEffect, useState } from "react";
import { StarRating } from "@/components/standard/star-rating";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-messages";
import { priceAccuracyLabel } from "@/lib/constants/standard-labels";
import { formatDateTime, formatKr, formatMonth } from "@/lib/format/danish";
import { createReplySchema } from "@/lib/schemas/standard";
import type { DentistMeDto } from "@/lib/types/dentist";
import type { PublicReviewDto } from "@/lib/types/standard";

type State =
  | { status: "loading" }
  | { status: "ready"; me: DentistMeDto; reviews: PublicReviewDto[] }
  | { status: "error"; message: string };

// Godkendte anmeldelser af tandlægen. Tandlægen kan svare offentligt; svaret modereres, før det vises (architecture 8.5, 10.9).
export function DentistReviews() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    apiRequest<DentistMeDto>("/api/dentists/me")
      .then(async (me) => {
        const { reviews } = await apiRequest<{ reviews: PublicReviewDto[] }>(`/api/dentists/${encodeURIComponent(me.id)}/reviews`);
        if (active) setState({ status: "ready", me, reviews });
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
        Indlæser anmeldelser …
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert tone="danger" role="alert" title="Anmeldelserne kunne ikke hentes">
        {state.message}
      </Alert>
    );
  }

  const { me, reviews } = state;

  return (
    <div className="flex flex-col gap-6">
      {!me.isVerified && (
        <Alert tone="warning" title="Afventer verifikation">
          <p>Du kan svare på anmeldelser, når din profil er verificeret.</p>
        </Alert>
      )}
      <Alert tone="info" title="Svar modereres">
        <p>Dit svar offentliggøres først, når det er gennemgået af moderation. Svar kun sagligt og uden personoplysninger.</p>
      </Alert>

      {reviews.length === 0 ? (
        <Card>
          <p className="text-base text-ink-muted">Der er ingen godkendte anmeldelser at svare på endnu.</p>
        </Card>
      ) : (
        <ul aria-label="Anmeldelser" className="flex flex-col gap-5">
          {reviews.map((review) => (
            <li key={review.id}>
              <ReviewReplyCard review={review} canReply={me.isVerified} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewReplyCard({ review, canReply }: { review: PublicReviewDto; canReply: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

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
      await apiRequest<{ id: string; moderationStatus: string }>(`/api/reviews/${review.id}/reply`, {
        method: "POST",
        body: parsed.data,
      });
      setPending(false);
      setSent(true);
    } catch (err) {
      setPending(false);
      setServerError(apiErrorMessage(err));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StarRating stars={review.stars} />
        <Badge tone="brand">Verificeret besøg</Badge>
      </div>
      <p className="text-sm text-ink-muted">Besøg fra {formatMonth(review.createdMonth)}</p>
      <p className="whitespace-pre-line text-base leading-relaxed text-ink">{review.text}</p>
      <p className="text-sm text-ink-muted">
        {priceAccuracyLabel(review.priceAccuracy)}
        {review.actualPrice !== null && `. Faktisk pris: ${formatKr(review.actualPrice)}`}
        {review.lackedTransparency && review.transparencyComment && `. Gennemsigtighed: ${review.transparencyComment}`}
      </p>

      {review.reply ? (
        <div className="rounded-lg border-l-4 border-brand-600 bg-brand-50 p-4">
          <p className="text-sm font-semibold text-ink">Dit offentlige svar</p>
          <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-ink">{review.reply.text}</p>
          <p className="mt-2 text-sm text-ink-muted">Svar fra {formatDateTime(review.reply.createdAt)}</p>
        </div>
      ) : sent ? (
        <Alert tone="success" role="status" title="Svaret er sendt">
          <p>Dit svar afventer moderation og vises, når det er godkendt.</p>
        </Alert>
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
      ) : null}
    </Card>
  );
}
