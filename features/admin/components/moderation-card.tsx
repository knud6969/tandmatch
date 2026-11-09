"use client";

import { useState } from "react";
import {
  ADMIN_REASON_MAX_CHARS,
  MODERATION_APPROVE_LABEL,
  MODERATION_REASON_LABEL,
  MODERATION_REJECTION_REASONS,
  MODERATION_REJECT_LABEL,
} from "@/lib/admin/constants/admin";
import type { AdminModerationItemDto } from "@/lib/admin/types/admin";
import { MODERATION_LABEL } from "@/lib/booking/constants/reviews";
import { REASON_REQUIRED_TEXT } from "@/lib/common/constants/error-texts";
import { formatDate } from "@/lib/common/domain/format";
import { toClinicDate, toClinicMonth } from "@/lib/common/domain/time";
import { MODERATION_TONE, ReviewDetails } from "@/features/booking/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { TextArea } from "@/components/ui/text-area";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";

type Decision = "approved" | "rejected";

// Ét element til moderation: indholdet, og "Godkend" / "Afvis". "Afvis" åbner en begrundelse med hurtigvalg. Ingen patientoplysninger.
export function ModerationCard({ item, onDone }: { item: AdminModerationItemDto; onDone: (item: AdminModerationItemDto, status: Decision) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const action = useAction();

  async function decide(status: Decision) {
    if (status === "rejected" && reason.trim() === "") {
      setReasonError(REASON_REQUIRED_TEXT);
      return;
    }
    setReasonError(undefined);
    const ok = await action.run(async () => {
      await apiRequest(`/api/admin/moderation/${item.kind}/${item.id}`, {
        method: "POST",
        body: status === "rejected" ? { status, reason: reason.trim() } : { status },
      });
    });
    if (ok) onDone(item, status);
  }

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-testid="moderation-kort" data-kind={item.kind} data-status={item.moderationStatus}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold text-ink" data-testid="moderation-klinik">
          {item.clinic.name}
        </p>
        <Badge tone={MODERATION_TONE[item.moderationStatus]}>{MODERATION_LABEL[item.moderationStatus]}</Badge>
        <span className="text-sm text-ink-muted">{formatDate(toClinicDate(item.createdAt))}</span>
      </div>

      {item.kind === "review" ? (
        <div className="flex flex-col gap-2">
          <ReviewDetails
            review={{
              id: item.id,
              stars: item.stars,
              text: item.text,
              priceAccuracy: item.priceAccuracy,
              actualPrice: item.actualPrice,
              lackedTransparency: item.lackedTransparency,
              transparencyComment: item.transparencyComment,
              verifiedVisit: true,
              createdMonth: toClinicMonth(item.createdAt),
              reply: null,
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">Svar fra klinikken</p>
          <p className="whitespace-pre-line break-words text-base text-ink">{item.text}</p>
          <p className="break-words rounded-control bg-surface-muted p-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">Anmeldelsen:</span> {item.reviewExcerpt}
          </p>
        </div>
      )}

      {item.moderationStatus === "rejected" && item.rejectionReason && (
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">Begrundelse:</span> {item.rejectionReason}
        </p>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-3" role="group" aria-label={`${MODERATION_REJECT_LABEL} ${item.clinic.name}`}>
          <div className="flex flex-wrap gap-2">
            {MODERATION_REJECTION_REASONS.map((quick) => (
              <Button key={quick} variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setReason(quick)}>
                {quick}
              </Button>
            ))}
          </div>
          <TextArea
            label={MODERATION_REASON_LABEL}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={ADMIN_REASON_MAX_CHARS}
            rows={3}
            error={reasonError}
          />
          <StatusMessage message={action.message} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" onClick={() => decide("rejected")} disabled={action.busy}>
              {action.busy ? "Gemmer …" : MODERATION_REJECT_LABEL}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={action.busy}>
              Fortryd
            </Button>
          </div>
        </div>
      ) : (
        <>
          <StatusMessage message={action.message} />
          <div className="flex flex-col gap-2 sm:flex-row">
            {item.moderationStatus !== "approved" && (
              <Button onClick={() => decide("approved")} disabled={action.busy}>
                {action.busy ? "Gemmer …" : MODERATION_APPROVE_LABEL}
              </Button>
            )}
            {item.moderationStatus !== "rejected" && (
              <Button variant="danger-outline" onClick={() => setRejecting(true)} disabled={action.busy}>
                {MODERATION_REJECT_LABEL}
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
