"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CLINIC_STATS_PERIODS,
  CLINIC_STATS_PERIOD_LABEL,
  STATS_EXPLANATION,
  STATS_LABEL,
  STATS_NOT_VERIFIED_TEXT,
  STATS_NO_VALUE,
  STATS_PERIOD_LABEL,
  STATS_UNDER_LEAD,
} from "@/lib/clinics/constants/stats";
import { formatResponseTime } from "@/lib/clinics/domain/stats";
import type { ClinicStatsDto, ClinicStatsPeriodDays } from "@/lib/clinics/types/stats";
import { FilterChips } from "@/components/ui/filter-chips";
import { LoadState } from "@/components/ui/load-state";
import { StatsCard } from "@/features/clinics/components/stats-card";
import { NotVerifiedNote } from "@/features/clinics/components/not-verified-note";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";

const OPTIONS = CLINIC_STATS_PERIODS.map((days) => ({ value: String(days), label: CLINIC_STATS_PERIOD_LABEL[days] }));
const pctText = (value: number | null) => (value === null ? STATS_NO_VALUE : `${value} %`);

// Tallene for en periode. Perioden står i URL'en (?dage=), så den kan deles og overlever en genindlæsning (clinics 6.3).
export function StatsOverview({ days }: { days: ClinicStatsPeriodDays }) {
  const router = useRouter();
  const load = useCallback(() => apiRequest<ClinicStatsDto>(`/api/clinics/me/stats?days=${days}`), [days]);
  const { data, loading, error, errorCode, reload } = useLoad(load);

  if (errorCode === "CLINIC_NOT_VERIFIED") return <NotVerifiedNote sentence={STATS_NOT_VERIFIED_TEXT} />;

  return (
    <div className="flex flex-col gap-6">
      <FilterChips
        label={STATS_PERIOD_LABEL}
        options={OPTIONS}
        value={String(days)}
        onChange={(value) => router.replace(`/klinik/statistik?dage=${value}`, { scroll: false })}
      />
      {!data ? (
        <LoadState loading={loading} error={error} onRetry={reload} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tal for perioden">
            <StatsCard id="henvendelser" title={STATS_LABEL.leads} value={data.leads.total} note={STATS_UNDER_LEAD.pending(data.leads.pending)} />
            <StatsCard
              id="accepteret"
              title={STATS_LABEL.accepted}
              value={data.leads.accepted}
              note={data.acceptRatePct === null ? null : STATS_UNDER_LEAD.acceptRate(data.acceptRatePct)}
            />
            <StatsCard id="afvist" title={STATS_LABEL.declined} value={data.leads.declined} />
            <StatsCard
              id="svartid"
              title={STATS_LABEL.response}
              value={data.response.medianMinutes === null ? STATS_NO_VALUE : formatResponseTime(data.response.medianMinutes)}
              note={data.response.within24hPct === null ? null : STATS_UNDER_LEAD.within24h(data.response.within24hPct)}
            />
            <StatsCard
              id="bookinger"
              title={STATS_LABEL.bookings}
              value={data.bookings.completed}
              note={STATS_UNDER_LEAD.upcomingNoShow(data.bookings.upcoming, data.bookings.noShow)}
            />
            <StatsCard
              id="aflyst"
              title={STATS_LABEL.cancelled}
              value={data.bookings.cancelledByPatient + data.bookings.cancelledByClinic}
              note={STATS_UNDER_LEAD.cancelled(data.bookings.cancelledByPatient, data.bookings.cancelledByClinic)}
            />
            <StatsCard id="konvertering" title={STATS_LABEL.conversion} value={pctText(data.leadToBookingPct)} />
          </ul>
          <p className="text-sm text-ink-muted">{STATS_EXPLANATION}</p>
        </>
      )}
    </div>
  );
}
