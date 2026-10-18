"use client";

import Link from "next/link";
import { useState } from "react";
import type { PatientBookingDto } from "@/lib/types/bookings";
import { BookingSummary } from "@/views/components/patient/booking-summary";
import { LinkButton } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/ui/load-state";
import { apiRequest } from "@/views/utils/api-client";
import { useLoad } from "@/views/utils/use-load";

const loadBookings = async (): Promise<PatientBookingDto[]> =>
  (await apiRequest<{ bookings: PatientBookingDto[] }>("/api/bookings")).bookings;

function Group({ title, bookings, onChanged, testId }: { title: string; bookings: PatientBookingDto[]; onChanged: () => void; testId: string }) {
  if (bookings.length === 0) return null;
  return (
    <section aria-labelledby={testId} className="flex flex-col gap-3" data-testid={testId}>
      <h2 id={testId} className="text-xl font-semibold text-ink">
        {title} ({bookings.length})
      </h2>
      <ul className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <BookingSummary booking={booking} showClinic onChanged={onChanged} />
              <div>
                <Link href={`/klinikker/${booking.clinic.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-700">
                  Se klinikken
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Patientens bookinger (architecture 6.2, 10.10): kommende (booket eller reserveret og endnu ikke slut) og tidligere.
export function BookingsList() {
  const { data, loading, error, reload } = useLoad(loadBookings);
  const [now] = useState(() => Date.now());
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  if (data.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">Du har ingen bookinger endnu</h2>
        <p className="text-base text-ink-muted">Når en klinik har accepteret din henvendelse, kan du booke en tid på sagen.</p>
        <LinkButton href="/patient" className="w-full sm:w-fit">
          Gå til mine sager
        </LinkButton>
      </Card>
    );
  }

  const upcoming = data
    .filter((b) => (b.status === "booked" || b.status === "held") && new Date(b.endsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = data.filter((b) => !upcoming.includes(b));

  return (
    <div className="flex flex-col gap-8">
      <Group title="Kommende" bookings={upcoming} onChanged={reload} testId="kommende" />
      <Group title="Tidligere" bookings={past} onChanged={reload} testId="tidligere" />
    </div>
  );
}
