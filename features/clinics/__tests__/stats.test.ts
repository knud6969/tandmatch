import { describe, expect, it } from "vitest";
import { formatResponseTime, toClinicStatsDto } from "@/lib/clinics/domain/stats";
import { clinicStatsQuerySchema } from "@/lib/clinics/schemas/stats";
import type { ClinicStatsRow } from "@/lib/clinics/types/stats";

const NOW = new Date("2026-11-04T10:00:00Z");

const row = (extra: Partial<ClinicStatsRow> = {}): ClinicStatsRow => ({
  leads_total: 0,
  leads_pending: 0,
  leads_accepted: 0,
  leads_declined: 0,
  leads_withdrawn_unanswered: 0,
  leads_emergency: 0,
  answered_within_24h: 0,
  median_response_minutes: null,
  leads_with_booking: 0,
  bookings_upcoming: 0,
  bookings_completed: 0,
  bookings_no_show: 0,
  bookings_cancelled_by_patient: 0,
  bookings_cancelled_by_clinic: 0,
  ...extra,
});

describe("toClinicStatsDto", () => {
  it("giver null i stedet for procenter, når intet kan beregnes", () => {
    const dto = toClinicStatsDto(row(), 30, NOW);
    expect(dto.acceptRatePct).toBeNull();
    expect(dto.response).toEqual({ medianMinutes: null, within24hPct: null });
    expect(dto.leadToBookingPct).toBeNull();
  });

  it("beregner procenter af besvarede og af alle leads og runder af", () => {
    const dto = toClinicStatsDto(
      row({ leads_total: 7, leads_pending: 1, leads_accepted: 2, leads_declined: 1, answered_within_24h: 2, leads_with_booking: 1, median_response_minutes: 94.6 }),
      90,
      NOW,
    );
    expect(dto.acceptRatePct).toBe(67); // 2 af 3
    expect(dto.response.within24hPct).toBe(67);
    expect(dto.response.medianMinutes).toBe(95);
    expect(dto.leadToBookingPct).toBe(14); // 1 af 7
  });

  it("sætter perioden til de seneste dage og slutter nu", () => {
    const dto = toClinicStatsDto(row(), 365, NOW);
    expect(dto.period).toEqual({ days: 365, from: "2025-11-04T10:00:00.000Z", to: "2026-11-04T10:00:00.000Z" });
  });

  it("videregiver tallene uændret", () => {
    const dto = toClinicStatsDto(
      row({ leads_emergency: 2, leads_withdrawn_unanswered: 3, bookings_upcoming: 4, bookings_completed: 5, bookings_no_show: 6, bookings_cancelled_by_patient: 7, bookings_cancelled_by_clinic: 8 }),
      30,
      NOW,
    );
    expect(dto.leads).toMatchObject({ emergency: 2, withdrawnUnanswered: 3 });
    expect(dto.bookings).toEqual({ upcoming: 4, completed: 5, noShow: 6, cancelledByPatient: 7, cancelledByClinic: 8 });
  });
});

describe("formatResponseTime", () => {
  it.each([
    [0, "under 1 min"],
    [0.4, "under 1 min"],
    [1, "1 min"],
    [45, "45 min"],
    [60, "1 t"],
    [135, "2 t 15 min"],
    [1439, "23 t 59 min"],
    [1440, "1 d"],
    [24 * 60 * 3 + 4 * 60 + 20, "3 d 4 t"],
  ])("%s minutter bliver til %s", (minutes, expected) => {
    expect(formatResponseTime(minutes)).toBe(expected);
  });
});

describe("clinicStatsQuerySchema", () => {
  it("bruger 30 dage som standard og accepterer 30, 90 og 365", () => {
    expect(clinicStatsQuerySchema.parse({}).days).toBe(30);
    expect(clinicStatsQuerySchema.parse({ days: "90" }).days).toBe(90);
    expect(clinicStatsQuerySchema.parse({ days: "365" }).days).toBe(365);
  });

  it("afviser andre værdier", () => {
    expect(clinicStatsQuerySchema.safeParse({ days: "7" }).success).toBe(false);
    expect(clinicStatsQuerySchema.safeParse({ days: "abc" }).success).toBe(false);
  });
});
