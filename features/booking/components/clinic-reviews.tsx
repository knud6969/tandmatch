"use client";

import { useState } from "react";
import { NO_SHOW_GRACE_HOURS } from "@/lib/booking/constants/bookings";
import { MODERATION_LABEL, REVIEW_REPLY_MAX_CHARS } from "@/lib/booking/constants/reviews";
import { replyReviewSchema } from "@/lib/booking/schemas/reviews";
import type { ClinicReviewDto } from "@/lib/booking/types/reviews";
import { ReviewDetails } from "@/features/booking/components/review-details";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadState } from "@/components/ui/load-state";
import { NotVerifiedNote } from "@/features/clinics/ui";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { MODERATION_TONE } from "@/features/booking/utils/review-status";
import { useAction } from "@/platform/ui-utils/use-action";
import { useLoad } from "@/platform/ui-utils/use-load";

const loadReviews = async (): Promise<ClinicReviewDto[]> =>
  (await apiRequest<{ reviews: ClinicReviewDto[] }>("/api/clinics/me/reviews")).reviews;

function ReplyForm({ reviewId, onSent, onCancel }: { reviewId: string; onSent: () => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const send = useAction();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = replyReviewSchema.safeParse({ text });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    const ok = await send.run(async () => {
      await apiRequest(`/api/reviews/${reviewId}/reply`, { method: "POST", body: parsed.data });
    });
    if (ok) onSent();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" aria-label="Svar på anmeldelsen">
      <TextArea
        label="Dit offentlige svar"
        hint="Svaret vises under anmeldelsen, når det er godkendt. Skriv ikke personoplysninger om patienten."
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={REVIEW_REPLY_MAX_CHARS}
        error={error}
        rows={4}
      />
      <p className="-mt-2 text-sm text-ink-muted">
        {text.trim().length} af {REVIEW_REPLY_MAX_CHARS} tegn
      </p>
      <StatusMessage message={send.message} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={send.busy}>
          {send.busy ? "Sender …" : "Send svar"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={send.busy}>
          Fortryd
        </Button>
      </div>
    </form>
  );
}

function ClinicReview({ review, onChanged }: { review: ClinicReviewDto; onChanged: () => void }) {
  const [replying, setReplying] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-testid="klinik-anmeldelse">
      <div className="flex flex-col gap-2">
        <ReviewDetails review={review} />
      </div>
      {review.replyStatus !== null && review.reply ? (
        <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3" data-testid="eget-svar" data-status={review.replyStatus}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">Dit svar</p>
            <Badge tone={MODERATION_TONE[review.replyStatus]}>{MODERATION_LABEL[review.replyStatus]}</Badge>
          </div>
          <p className="whitespace-pre-line break-words text-base text-ink">{review.reply.text}</p>
        </div>
      ) : replying ? (
        <ReplyForm reviewId={review.id} onSent={onChanged} onCancel={() => setReplying(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setReplying(true)}>
            Svar<span className="sr-only"> på anmeldelsen</span>
          </Button>
        </div>
      )}
    </li>
  );
}

// Klinikkens godkendte anmeldelser med mulighed for ét offentligt svar pr. anmeldelse (architecture 6.3, 8.5).
export function ClinicReviews() {
  const { data, loading, error, errorCode, reload } = useLoad(loadReviews);
  if (errorCode === "CLINIC_NOT_VERIFIED") return <NotVerifiedNote sentence="Dine anmeldelser bliver tilgængelige, når TandMatch har verificeret klinikken." />;
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.length === 0) {
    return (
      <p className="text-base text-ink-muted">
        Der er endnu ingen godkendte anmeldelser. Patienter kan anmelde {NO_SHOW_GRACE_HOURS} timer efter et gennemført besøg, og anmeldelser vises her, når de er godkendt.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {data.map((review) => (
        <ClinicReview key={review.id} review={review} onChanged={reload} />
      ))}
    </ul>
  );
}
