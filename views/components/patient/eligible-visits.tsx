"use client";

import { NO_SHOW_GRACE_HOURS } from "@/lib/constants/bookings";
import type { ReviewEligibleItemDto } from "@/lib/types/reviews";
import { LinkButton } from "@/views/components/ui/button";
import { LoadState } from "@/views/components/ui/load-state";
import { reviewHref } from "@/views/utils/case-links";
import { loadEligibleVisits } from "@/views/utils/eligible-visits";
import { formatDate } from "@/views/utils/format";
import { useLoad } from "@/views/utils/use-load";

function Visit({ item }: { item: ReviewEligibleItemDto }) {
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card" data-testid="kan-anmeldes">
      <p className="text-base font-semibold text-ink">{item.clinicName}</p>
      <p className="text-base text-ink">
        {item.serviceName} · {formatDate(item.visitedOn)}
      </p>
      <LinkButton href={reviewHref(item.bookingId)} className="w-full sm:w-fit">
        Skriv anmeldelse<span className="sr-only"> af {item.clinicName}</span>
      </LinkButton>
    </li>
  );
}

// Gennemførte besøg, der kan anmeldes (architecture 6.2, 10.13).
export function EligibleVisits() {
  const { data, loading, error, reload } = useLoad(loadEligibleVisits);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  if (data.length === 0) {
    return <p className="text-base text-ink-muted">Ingen besøg kan anmeldes lige nu. Du kan anmelde {NO_SHOW_GRACE_HOURS} timer efter et gennemført besøg.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.map((item) => (
        <Visit key={item.bookingId} item={item} />
      ))}
    </ul>
  );
}
