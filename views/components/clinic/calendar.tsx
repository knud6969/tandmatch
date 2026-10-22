"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toClinicDate } from "@/lib/common/domain/time";
import { BOOKING_STATUS_LABEL, CLINIC_BOOKINGS_DEFAULT_PAST_DAYS, BOOKING_HORIZON_DAYS, NO_SHOW_GRACE_HOURS } from "@/lib/constants/bookings";
import type { ClinicBookingDto } from "@/lib/types/bookings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotVerifiedNote } from "@/views/components/clinic/not-verified-note";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { LoadState } from "@/components/ui/load-state";
import { StatusMessage } from "@/components/ui/status-message";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { BOOKING_STATUS_TONE } from "@/views/utils/booking-status";
import { clinicLeadHref } from "@/views/utils/clinic-links";
import { formatDay, formatShortDateTime, formatTime } from "@/platform/ui-utils/format";
import { groupByDay } from "@/platform/ui-utils/group-by-day";
import { phoneHref } from "@/platform/ui-utils/links";
import { useAction } from "@/platform/ui-utils/use-action";
import { useLoad } from "@/platform/ui-utils/use-load";

const loadBookings = async (): Promise<ClinicBookingDto[]> =>
  (await apiRequest<{ bookings: ClinicBookingDto[] }>("/api/bookings")).bookings;

type Pending = "cancel" | "no-show" | null;

function BookingRow({ booking, onChanged }: { booking: ClinicBookingDto; onChanged: () => void }) {
  const [pending, setPending] = useState<Pending>(null);
  const action = useAction();
  const inactive = booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show";

  async function run(kind: "cancel" | "no-show") {
    const ok = await action.run(async () => {
      await apiRequest(`/api/bookings/${booking.id}/${kind}`, { method: "POST", body: {} });
    });
    setPending(null);
    if (ok) onChanged();
  }

  return (
    <li
      className={cx("flex flex-col gap-2 rounded-control border border-line p-3 sm:p-4", inactive ? "bg-surface-muted" : "bg-surface")}
      data-testid="kalender-booking"
      data-status={booking.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-ink">
          {formatTime(booking.startsAt)}–{formatTime(booking.endsAt)}
        </span>
        <Badge tone={BOOKING_STATUS_TONE[booking.status]}>{BOOKING_STATUS_LABEL[booking.status]}</Badge>
      </div>
      <p className="text-base text-ink">{booking.service.name}</p>

      {booking.status === "held" && (
        <p className="text-sm text-ink-muted" data-testid="reservation">
          Akuttid reserveret til patienten
          {booking.holdExpiresAt ? `, udløber ${formatShortDateTime(booking.holdExpiresAt)}` : ""}. Svar på henvendelsen for at bekræfte eller frigive
          tiden. Patientens kontaktoplysninger vises, når tiden er booket.
        </p>
      )}
      {booking.contact && (
        <dl className="grid gap-x-4 gap-y-1 text-base sm:grid-cols-[auto_1fr]" data-testid="kalender-kontakt">
          <dt className="text-ink-muted">Patient</dt>
          <dd className="font-semibold text-ink">{booking.contact.name}</dd>
          <dt className="text-ink-muted">Telefon</dt>
          <dd>
            <a href={phoneHref(booking.contact.phone)} className="inline-flex min-h-11 items-center font-semibold text-brand-700 sm:min-h-0">
              {booking.contact.phone}
            </a>
          </dd>
          <dt className="text-ink-muted">E-mail</dt>
          <dd className="break-all text-ink">{booking.contact.email}</dd>
        </dl>
      )}

      <StatusMessage message={action.message} />

      {pending ? (
        <div className="flex flex-col gap-2" role="group" aria-label={pending === "cancel" ? "Bekræft aflysning" : "Bekræft udeblivelse"}>
          <p className="text-sm text-ink-muted">
            {pending === "cancel"
              ? "Patienten får tiden aflyst, og tiden bliver ledig igen."
              : "Patienten markeres som udeblevet. Det kan ikke fortrydes."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" onClick={() => run(pending)} disabled={action.busy}>
              {action.busy ? "Gemmer …" : pending === "cancel" ? "Ja, aflys tiden" : "Ja, marker udeblevet"}
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={action.busy}>
              Fortryd
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href={clinicLeadHref(booking.leadId)} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
            Se henvendelsen
          </Link>
          {booking.canMarkNoShow && (
            <Button variant="secondary" onClick={() => setPending("no-show")}>
              Marker udeblevet
            </Button>
          )}
          {booking.canCancel && (
            <Button variant="danger-outline" onClick={() => setPending("cancel")}>
              Aflys
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// Klinikkens kalender (architecture 6.3, 10.10): bookinger og reserverede akuttider pr. dag. Gennemført sættes automatisk
// efter sluttid, så der er ingen knap til det.
export function ClinicCalendar() {
  const { data, loading, error, errorCode, reload } = useLoad(loadBookings);
  const [showCancelled, setShowCancelled] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [today] = useState(() => toClinicDate(new Date()));

  const { upcoming, past, cancelledCount } = useMemo(() => {
    const all = data ?? [];
    const visible = all.filter((b) => showCancelled || b.status !== "cancelled");
    const sorted = [...visible].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const grouped = groupByDay(sorted, (b) => b.startsAt);
    const future = grouped.filter(([key]) => key >= today);
    // Listen starter ved i dag; dagens kort vises også uden bookinger.
    const upcoming: [string, ClinicBookingDto[]][] = future[0]?.[0] === today ? future : [[today, []], ...future];
    return {
      upcoming,
      past: grouped.filter(([key]) => key < today),
      cancelledCount: all.filter((b) => b.status === "cancelled").length,
    };
  }, [data, showCancelled, today]);

  if (errorCode === "CLINIC_NOT_VERIFIED") return <NotVerifiedNote sentence="Din kalender bliver tilgængelig, når TandMatch har verificeret klinikken." />;
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const days = showPast ? [...past, ...upcoming] : upcoming;
  const hasBookings = upcoming.some(([, list]) => list.length > 0) || past.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        Viser de næste {BOOKING_HORIZON_DAYS} dage og de seneste {CLINIC_BOOKINGS_DEFAULT_PAST_DAYS} dage. Udeblivelse kan registreres fra
        starttidspunktet og op til {NO_SHOW_GRACE_HOURS} timer efter, at tiden er slut. Besøg bliver automatisk gennemført efter den frist.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {past.length > 0 && (
          <Button variant="secondary" onClick={() => setShowPast((v) => !v)} aria-pressed={showPast}>
            {showPast ? "Skjul tidligere dage" : `Vis tidligere dage (${past.length})`}
          </Button>
        )}
        {cancelledCount > 0 && (
          <Button variant="ghost" onClick={() => setShowCancelled((v) => !v)} aria-pressed={showCancelled}>
            {showCancelled ? "Skjul aflyste tider" : `Vis aflyste tider (${cancelledCount})`}
          </Button>
        )}
      </div>
      {!hasBookings && (
        <p className="text-base text-ink-muted" data-testid="ingen-bookinger">
          Der er ingen bookinger i perioden. Når en patient booker en tid efter en accepteret henvendelse, dukker den op her.
        </p>
      )}
      <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-label="Bookinger pr. dag">
        {days.map(([key, bookings]) => (
          <li key={key} className="min-w-0">
            <Card className="flex flex-col gap-3 p-4 sm:p-5" data-testid="kalender-dag">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                <span className="first-letter:uppercase">{formatDay(bookings[0]?.startsAt ?? `${key}T12:00:00Z`)}</span>
                {key === today && <Badge tone="brand">I dag</Badge>}
              </h2>
              {bookings.length === 0 ? (
                hasBookings ? <p className="text-base text-ink-muted">Ingen bookinger i dag.</p> : null
              ) : (
                <ul className="flex flex-col gap-3">
                  {bookings.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} onChanged={reload} />
                  ))}
                </ul>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
