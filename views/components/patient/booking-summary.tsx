"use client";

import { useState } from "react";
import { BOOKING_STATUS_LABEL } from "@/lib/constants/bookings";
import type { PatientBookingDto } from "@/lib/types/bookings";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { BOOKING_STATUS_TONE } from "@/views/utils/booking-status";
import { formatDateTime, formatShortDateTime } from "@/views/utils/format";
import { useAction } from "@/views/utils/use-action";

// Én booking med tid, behandling, status og "Aflys" (kun når serveren siger canCancel). Bruges på sagen og i bookingoversigten.
export function BookingSummary({
  booking,
  showClinic = false,
  onChanged,
}: {
  booking: PatientBookingDto;
  showClinic?: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useAction();

  async function cancelBooking() {
    const ok = await cancel.run(async () => {
      await apiRequest(`/api/bookings/${booking.id}/cancel`, { method: "POST", body: {} });
    });
    if (ok) onChanged();
    else setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3 sm:p-4" data-testid="booking" data-status={booking.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{BOOKING_STATUS_LABEL[booking.status]}</Badge>
        <span className="text-base font-semibold text-ink" data-testid="booking-tid">
          {formatDateTime(booking.startsAt)}
        </span>
      </div>
      {showClinic && <p className="text-base font-semibold text-ink">{booking.clinic.name}</p>}
      <p className="text-base text-ink">{booking.service.name}</p>
      <p className="text-sm text-ink-muted">
        {booking.clinic.address}, {booking.clinic.city}
      </p>
      {booking.status === "held" && booking.holdExpiresAt && (
        <p className="text-sm text-ink-muted">
          Tiden er reserveret, til klinikken svarer, dog senest {formatShortDateTime(booking.holdExpiresAt)}.
        </p>
      )}
      <StatusMessage message={cancel.message} />
      {booking.canCancel &&
        (confirming ? (
          <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label="Bekræft aflysning">
            <Button variant="danger" onClick={cancelBooking} disabled={cancel.busy}>
              {cancel.busy ? "Aflyser …" : "Ja, aflys tiden"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={cancel.busy}>
              Behold tiden
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="danger-outline" onClick={() => setConfirming(true)}>
              Aflys<span className="sr-only"> tiden hos {booking.clinic.name}</span>
            </Button>
          </div>
        ))}
    </div>
  );
}
