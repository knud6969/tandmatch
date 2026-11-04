import { DAY_MS } from "@/lib/common/domain/time";
import type { ClinicStatsDto, ClinicStatsPeriodDays, ClinicStatsRow } from "@/lib/clinics/types/stats";

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((100 * part) / whole) : null;
}

// Perioden for et antal dage: slutter nu. Bruges af controlleren (kald til clinic_stats) og af toClinicStatsDto().
export function statsPeriod(days: ClinicStatsPeriodDays, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

// Række fra clinic_stats() -> DTO. Procenter og afrunding sker her, så siden ikke regner selv (clinics 10.18).
export function toClinicStatsDto(row: ClinicStatsRow, days: ClinicStatsPeriodDays, now: Date): ClinicStatsDto {
  const { from, to } = statsPeriod(days, now);
  const answered = row.leads_accepted + row.leads_declined;
  return {
    period: { days, from: from.toISOString(), to: to.toISOString() },
    leads: {
      total: row.leads_total,
      pending: row.leads_pending,
      accepted: row.leads_accepted,
      declined: row.leads_declined,
      withdrawnUnanswered: row.leads_withdrawn_unanswered,
      emergency: row.leads_emergency,
    },
    acceptRatePct: pct(row.leads_accepted, answered),
    response: {
      medianMinutes: row.median_response_minutes === null ? null : Math.round(row.median_response_minutes),
      within24hPct: pct(row.answered_within_24h, answered),
    },
    bookings: {
      upcoming: row.bookings_upcoming,
      completed: row.bookings_completed,
      noShow: row.bookings_no_show,
      cancelledByPatient: row.bookings_cancelled_by_patient,
      cancelledByClinic: row.bookings_cancelled_by_clinic,
    },
    leadToBookingPct: pct(row.leads_with_booking, row.leads_total),
  };
}

// Svartid som tekst: "under 1 min", "45 min", "2 t 15 min", "3 d 4 t".
export function formatResponseTime(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 1) return "under 1 min";
  if (total < 60) return `${total} min`;
  if (total < 24 * 60) {
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
  }
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  return hours === 0 ? `${days} d` : `${days} d ${hours} t`;
}
