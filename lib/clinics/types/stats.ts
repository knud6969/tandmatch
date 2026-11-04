import type { CLINIC_STATS_PERIODS } from "@/lib/clinics/constants/stats";

export type ClinicStatsPeriodDays = (typeof CLINIC_STATS_PERIODS)[number];

// Rækken fra clinic_stats() (snake_case, som databasen returnerer den). Kun tal.
export type ClinicStatsRow = {
  leads_total: number;
  leads_pending: number;
  leads_accepted: number;
  leads_declined: number;
  leads_withdrawn_unanswered: number;
  leads_emergency: number;
  answered_within_24h: number;
  median_response_minutes: number | null;
  leads_with_booking: number;
  bookings_upcoming: number;
  bookings_completed: number;
  bookings_no_show: number;
  bookings_cancelled_by_patient: number;
  bookings_cancelled_by_clinic: number;
};

export type ClinicStatsDto = {
  period: { days: ClinicStatsPeriodDays; from: string; to: string }; // ISO; to = nu
  leads: { total: number; pending: number; accepted: number; declined: number; withdrawnUnanswered: number; emergency: number };
  acceptRatePct: number | null; // round(100 * accepted / (accepted + declined)); null ved 0 besvarede
  response: { medianMinutes: number | null; within24hPct: number | null }; // within24hPct af besvarede
  bookings: { upcoming: number; completed: number; noShow: number; cancelledByPatient: number; cancelledByClinic: number };
  leadToBookingPct: number | null; // round(100 * leadsWithBooking / total); null ved 0 leads
};
