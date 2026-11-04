import { z } from "zod";
import { CLINIC_STATS_PERIODS, DEFAULT_CLINIC_STATS_PERIOD } from "@/lib/clinics/constants/stats";
import type { ClinicStatsPeriodDays } from "@/lib/clinics/types/stats";

// GET /api/clinics/me/stats?days=30|90|365 (standard 30). Andre værdier giver 400 VALIDATION_ERROR.
export const clinicStatsQuerySchema = z.object({
  days: z
    .string()
    .refine((value) => CLINIC_STATS_PERIODS.some((period) => String(period) === value), "Vælg 30, 90 eller 365 dage.")
    .optional()
    .transform((value): ClinicStatsPeriodDays => (value === undefined ? DEFAULT_CLINIC_STATS_PERIOD : (Number(value) as ClinicStatsPeriodDays))),
});
