import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { statsPeriod, toClinicStatsDto } from "@/lib/clinics/domain/stats";
import type { ClinicStatsDto, ClinicStatsPeriodDays } from "@/lib/clinics/types/stats";
import type { Session } from "@/platform/middleware/session";
import { ClinicStatsRepository } from "@/features/clinics/clinicStatsRepository";
import { ClinicsRepository } from "@/features/clinics/clinicsRepository";

// Afhængigheder, der kan erstattes i tests (architecture 2.1.1).
export type ClinicStatsDeps = { clinics: ClinicsRepository; stats: ClinicStatsRepository; now: () => Date };

// Klinikkens egne tal (clinics 10.18). Kun for en verificeret klinik (403 CLINIC_NOT_VERIFIED); perioden slutter nu.
export class ClinicStatsController {
  private readonly clinics: ClinicsRepository;
  private readonly stats: ClinicStatsRepository;
  private readonly now: () => Date;

  constructor(
    supabase: SupabaseClient,
    private readonly session: Session,
    deps: Partial<ClinicStatsDeps> = {},
  ) {
    this.clinics = deps.clinics ?? new ClinicsRepository(supabase);
    this.stats = deps.stats ?? new ClinicStatsRepository(supabase);
    this.now = deps.now ?? (() => new Date());
  }

  async get(days: ClinicStatsPeriodDays): Promise<ClinicStatsDto> {
    await this.clinics.requireOwnVerified(this.session.userId);
    const now = this.now();
    const { from, to } = statsPeriod(days, now);
    return toClinicStatsDto(await this.stats.get(from, to), days, now);
  }
}
